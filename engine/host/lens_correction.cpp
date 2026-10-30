#include "lens_correction.hpp"
#include "platform.hpp"
#include <lensfun/lensfun.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <future>
#include <memory>
#include <mutex>
#include <stdexcept>

namespace spkhost {
namespace {
std::mutex database_mutex;
std::unique_ptr<lfDatabase> database;
std::string database_error="lens database is not configured";
using Matrix=std::array<double,9>;
const Matrix identity={1,0,0,0,1,0,0,0,1};
template<class F> void parallel_rows(uint32_t rows,F&& body) {
    const unsigned count=std::min({8u,hardware_threads(),std::max(1u,rows/16)});
    if(count<=1){body(0,rows);return;}
    std::vector<std::future<void>> tasks;
    const uint32_t step=(rows+count-1)/count;
    for(unsigned t=0;t<count;++t) {
        const auto begin=t*step,end=std::min(rows,begin+step);
        if(begin<end)tasks.push_back(std::async(std::launch::async,[&body,begin,end]{body(begin,end);}));
    }
    std::exception_ptr failure;
    for(auto& task:tasks)try{task.get();}catch(...){if(!failure)failure=std::current_exception();}
    if(failure)std::rethrow_exception(failure);
}
Matrix inverse(const Matrix& m) {
    const double d=m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);
    if(!std::isfinite(d)||std::abs(d)<1e-10)throw std::runtime_error("camera colour matrix is singular; TCA correction is unavailable");
    return {(m[4]*m[8]-m[5]*m[7])/d,(m[2]*m[7]-m[1]*m[8])/d,(m[1]*m[5]-m[2]*m[4])/d,
        (m[5]*m[6]-m[3]*m[8])/d,(m[0]*m[8]-m[2]*m[6])/d,(m[2]*m[3]-m[0]*m[5])/d,
        (m[3]*m[7]-m[4]*m[6])/d,(m[1]*m[6]-m[0]*m[7])/d,(m[0]*m[4]-m[1]*m[3])/d};
}
struct Match {const lfCamera* camera=nullptr;const lfLens* lens=nullptr;std::string reason;};
Match match(const Probe& probe) {
    if(!database)return {nullptr,nullptr,database_error};
    const auto& m=probe.metadata;
    if(m.model.empty()||m.lens.empty()||!m.focal_mm)return {nullptr,nullptr,"camera, lens or focal-length metadata is missing"};
    const lfCamera** cameras=database->FindCameras(nullptr,m.model.c_str());
    const lfCamera* camera=nullptr;
    if(cameras&&cameras[0]&&!cameras[1])camera=cameras[0];
    lf_free(cameras);
    if(!camera)return {nullptr,nullptr,"camera profile was not matched uniquely"};
    const lfLens** lenses=database->FindLenses(camera,nullptr,m.lens.c_str());
    const lfLens* lens=nullptr;
    if(lenses&&lenses[0]&&(!lenses[1]||lenses[0]->Score>lenses[1]->Score))lens=lenses[0];
    lf_free(lenses);
    if(!lens)return {camera,nullptr,"lens profile was not matched uniquely"};
    return {camera,lens,{}};
}
struct Correction {
    LensCorrectionInfo info;
    std::unique_ptr<lfModifier> modifier;
};
Correction prepare(const Probe& probe) {
    Correction out;const auto selected=match(probe);
    if(!selected.lens){out.info.reason=selected.reason;return out;}
    int w=int(probe.width),h=int(probe.height);
    if(probe.metadata.orientation>=5)std::swap(w,h);
    if(w<2||h<2){out.info.reason="image is too small for lens correction";return out;}
    out.modifier=std::make_unique<lfModifier>(selected.lens,float(*probe.metadata.focal_mm),selected.camera->CropFactor,w,h,LF_PF_F32);
    auto& mod=*out.modifier;
    int flags=mod.EnableDistortionCorrection();
    out.info.distortion=(flags&LF_MODIFY_DISTORTION)!=0;
    flags=mod.EnableTCACorrection();out.info.tca=(flags&LF_MODIFY_TCA)!=0;
    if(const auto it=probe.metadata.extra_exif.find(0x9206);it!=probe.metadata.extra_exif.end()) {
        const auto& v=it->second;
        if(v.type==5&&v.count==1&&v.bytes.size()==8) {
            auto u32=[&](size_t at){uint32_t n=0;for(int i=0;i<4;++i)n|=uint32_t(v.bytes[at+i])<<(8*i);return n;};
            const auto n=u32(0),d=u32(4);
            if(n&&d&&n!=UINT32_MAX) {
                const double metres=double(n)/d;
                if(std::isfinite(metres)&&metres>0&&metres<=1000000) {
                    out.info.focus_distance_m=metres;out.info.focus_distance_assumed=false;
                }
            }
        }
    }
    if(probe.metadata.aperture)flags=mod.EnableVignettingCorrection(float(*probe.metadata.aperture),float(out.info.focus_distance_m));
    out.info.vignetting=(flags&LF_MODIFY_VIGNETTING)!=0;
    out.info.available=out.info.distortion||out.info.tca||out.info.vignetting;
    out.info.profile=lf_mlstr_get(selected.lens->Model);
    if(!out.info.available)out.info.reason="profile has no calibration at this focal length and aperture";
    if(out.info.distortion||out.info.tca) {
        const float scale=mod.GetAutoScale(false);
        if(!std::isfinite(scale)||scale<=0||scale>8)throw std::runtime_error("lens profile returned an invalid automatic crop");
        mod.EnableScaling(scale);out.info.scale=scale;
    }
    return out;
}
std::array<float,2> displayed(float x,float y,uint32_t w,uint32_t h,int orientation) {
    switch(orientation) {
        case 2:return {float(w-1)-x,y};case 3:return {float(w-1)-x,float(h-1)-y};
        case 4:return {x,float(h-1)-y};case 5:return {y,x};case 6:return {float(h-1)-y,x};
        case 7:return {float(h-1)-y,float(w-1)-x};case 8:return {y,float(w-1)-x};
        default:return {x,y};
    }
}
float cubic(float x) {
    x=std::abs(x);
    if(x<1)return ((1.5f*x-2.5f)*x)*x+1;
    if(x<2)return ((-.5f*x+2.5f)*x-4)*x+2;
    return 0;
}
float sample(const FloatImage& src,float x,float y,int channel) {
    if(!std::isfinite(x)||!std::isfinite(y))throw std::runtime_error("non-finite lens coordinate");
    x=std::clamp(x,0.f,float(src.width-1));y=std::clamp(y,0.f,float(src.height-1));
    int ix=int(std::floor(x)),iy=int(std::floor(y));float value=0;
    for(int j=-1;j<=2;++j) {
        const float wy=cubic(y-float(iy+j));
        const auto yy=uint32_t(std::clamp(iy+j,0,int(src.height)-1));
        for(int i=-1;i<=2;++i) {
            const auto xx=uint32_t(std::clamp(ix+i,0,int(src.width)-1));
            value+=src.rgb[(size_t(yy)*src.width+xx)*3+channel]*(wy*cubic(x-float(ix+i)));
        }
    }
    return value;
}

// Adobe Camera Model, in the original sensor axes. The LCP coordinates are
// normalized by Dmax for focal length, but by width/height for image centre.
// No film/paper data or colour-space clipping participates in this transform.
struct LcpModel {
    double fx=1,fy=1,cx=.5,cy=.5,scale=1;
    std::array<double,5> k{};
};
double lcp_number(const spk::Json& j,const char* key,double fallback,double lo,double hi) {
    const auto& v=j.at(key);if(v.is_null())return fallback;
    if(!v.is_number()||!std::isfinite(v.as_double())||v.as_double()<lo||v.as_double()>hi)
        throw std::runtime_error(std::string("invalid LCP ")+key);
    return v.as_double();
}
LcpModel lcp_model(const spk::Json& j,double focal,double crop,uint32_t w,uint32_t h) {
    if(!j.is_object())throw std::runtime_error("missing LCP model");
    LcpModel m;
    m.fx=lcp_number(j,"fx",-1,-1,100);m.fy=lcp_number(j,"fy",-1,-1,100);
    if(m.fx==-1)m.fx=focal*crop/35.;if(m.fy==-1)m.fy=m.fx;
    if(m.fx<=0||m.fy<=0)throw std::runtime_error("invalid LCP focal normalization");
    m.fx*=std::max(w,h);m.fy*=std::max(w,h);
    m.cx=lcp_number(j,"cx",.5,0,1)*w;m.cy=lcp_number(j,"cy",.5,0,1)*h;
    m.scale=lcp_number(j,"scale",1,.01,100);
    const auto& k=j.at("k");if(!k.is_array()||k.items().size()!=5)throw std::runtime_error("invalid LCP coefficients");
    for(size_t i=0;i<5;++i){const auto& v=k.items()[i];if(!v.is_number()||!std::isfinite(v.as_double())||std::abs(v.as_double())>1000)throw std::runtime_error("invalid LCP coefficient");m.k[i]=v.as_double();}
    return m;
}
LcpModel blend(const LcpModel& a,const LcpModel& b,double t) {
    auto mix=[&](double x,double y){return x+(y-x)*t;};LcpModel m;
    m.fx=mix(a.fx,b.fx);m.fy=mix(a.fy,b.fy);m.cx=mix(a.cx,b.cx);m.cy=mix(a.cy,b.cy);m.scale=mix(a.scale,b.scale);
    for(size_t i=0;i<5;++i)m.k[i]=mix(a.k[i],b.k[i]);return m;
}
std::array<double,2> lcp_map(const LcpModel& m,double x,double y,bool fisheye=false) {
    const double dx=x-m.cx,dy=y-m.cy;
    if(fisheye) {
        const double r=std::hypot(dx,dy),f=std::sqrt(m.fx*m.fy),theta=std::atan2(r,f),t2=theta*theta;
        const double q=r>1e-12?theta*(1+t2*(m.k[0]+t2*m.k[1]))/r:1/f;
        return {m.cx+dx*q*m.fx,m.cy+dy*q*m.fy};
    }
    const double u=dx/m.fx,v=dy/m.fy,r2=u*u+v*v;
    const double radial=1+r2*(m.k[0]+r2*(m.k[1]+r2*m.k[2]));
    return {m.cx+m.fx*m.scale*(u*radial+2*m.k[3]*u*v+m.k[4]*(r2+2*u*u)),
            m.cy+m.fy*m.scale*(v*radial+m.k[3]*(r2+2*v*v)+2*m.k[4]*u*v)};
}
bool correct_lcp(FloatImage& image,Probe& probe,const spk::Json& profile) {
    if(!profile.is_object()||profile.at("version").as_int()!=1||!profile.at("raw").as_bool())
        throw std::runtime_error("choose an LCP made for RAW photographs");
    const auto& entries=profile.at("entries");
    if(!entries.is_array()||entries.items().empty()||entries.items().size()>4096)throw std::runtime_error("invalid LCP calibration table");
    if(!probe.metadata.focal_mm||*probe.metadata.focal_mm<=0)throw std::runtime_error("LCP requires focal-length metadata");
    if(!image.raw_metadata||image.raw_metadata->colour_channels!=3)throw std::runtime_error("LCP requires a three-colour RAW decode");
    const auto orientation=probe.metadata.orientation;
    const uint32_t w=orientation>=5?image.height:image.width,h=orientation>=5?image.width:image.height;
    const double focal=*probe.metadata.focal_mm,aperture=probe.metadata.aperture.value_or(8);
    // For each focal length retain the measured aperture closest to this shot.
    // Interpolate adjacent focal lengths in log space; never extrapolate.
    std::map<double,const spk::Json*> best;
    auto score=[&](const spk::Json& e){return std::abs(lcp_number(e,"aperture",aperture,0,128)-aperture);};
    const bool fisheye=entries.items().front().at("fisheye").as_bool();
    for(const auto& e:entries.items()) {
        const double f=lcp_number(e,"focal",0,.1,3000);
        if(e.at("fisheye").as_bool()!=fisheye)throw std::runtime_error("mixed LCP projections");
        if(!best.count(f)||score(e)<score(*best[f]))best[f]=&e;
    }
    auto hi=best.lower_bound(focal);if(hi==best.end())hi=std::prev(best.end());
    auto lo=hi;if(hi->first>focal&&hi!=best.begin())--lo;
    const double t=lo==hi?0:std::clamp(std::log(focal/lo->first)/std::log(hi->first/lo->first),0.,1.);
    auto model=[&](const char* key){
        return blend(lcp_model(lo->second->at(key),lo->first,lcp_number(*lo->second,"crop",1,.1,20),w,h),
                     lcp_model(hi->second->at(key),hi->first,lcp_number(*hi->second,"crop",1,.1,20),w,h),t);
    };
    auto has=[&](const char* key){return lo->second->at(key).is_object()&&hi->second->at(key).is_object();};
    const auto base=model("base");
    const bool tca=!fisheye&&has("green")&&has("red")&&has("blue"),vignette=has("vignette");
    const auto green=tca?model("green"):base,red=tca?model("red"):base,blue=tca?model("blue"):base;
    const auto vign=vignette?model("vignette"):base;
    auto coordinate=[&](double x,double y,int c,double zoom){
        x=(x-(w-1)*.5)/zoom+(w-1)*.5;y=(y-(h-1)*.5)/zoom+(h-1)*.5;
        auto p=lcp_map(tca?green:base,x,y,fisheye);
        if(tca&&c!=1) {
            // Red/blue calibrations are residuals relative to green. Their
            // own centre and focal normalization belong to the final map.
            const auto& m=c==0?red:blue;
            p=lcp_map(m,m.cx+(p[0]-green.cx)*m.fx/green.fx,m.cy+(p[1]-green.cy)*m.fy/green.fy);
        }
        return p;
    };
    auto fits=[&](double zoom){
        for(int side=0;side<4;++side)for(int i=0;i<=256;++i)for(int c=0;c<3;++c) {
            const double u=double(i)/256;const auto p=coordinate(side<2?u*(w-1):(side==2?0:w-1),side>=2?u*(h-1):(side==0?0:h-1),c,zoom);
            if(!std::isfinite(p[0])||!std::isfinite(p[1])||p[0]<0||p[1]<0||p[0]>w-1||p[1]>h-1)return false;
        }return true;
    };
    double zoom=1;
    if(!fits(zoom)) {double low=1,high=8;if(!fits(high))throw std::runtime_error("LCP cannot produce a valid automatic crop");
        for(int i=0;i<24;++i){const double middle=(low+high)*.5;if(fits(middle))high=middle;else low=middle;}zoom=high*1.0001;}
    Matrix to_camera=identity,to_working=identity;
    if(tca){for(int r=0;r<3;++r)for(int c=0;c<3;++c)to_working[r*3+c]=image.raw_metadata->camera_to_output[r*4+c];to_camera=inverse(to_working);}
    parallel_rows(h,[&](uint32_t begin,uint32_t end){for(uint32_t y=begin;y<end;++y)for(uint32_t x=0;x<w;++x){
        const auto p=displayed(float(x),float(y),w,h,orientation);float* dst=image.rgb.data()+(size_t(uint32_t(p[1]))*image.width+uint32_t(p[0]))*3;
        const std::array<float,3> src={dst[0],dst[1],dst[2]};double gain=1;
        if(vignette){const double u=(x-vign.cx)/vign.fx,v=(y-vign.cy)/vign.fy,r=u*u+v*v,falloff=1+r*(vign.k[0]+r*(vign.k[1]+r*vign.k[2]));
            if(!std::isfinite(falloff)||falloff<.01||falloff>100)throw std::runtime_error("invalid LCP vignetting gain");gain=1/falloff;}
        for(int c=0;c<3;++c)dst[c]=float((to_camera[c*3]*src[0]+to_camera[c*3+1]*src[1]+to_camera[c*3+2]*src[2])*gain);
    }});
    std::vector<float> output(image.rgb.size());
    parallel_rows(h,[&](uint32_t begin,uint32_t end){for(uint32_t y=begin;y<end;++y)for(uint32_t x=0;x<w;++x){
        std::array<float,3> v{};for(int c=0;c<3;++c){const auto q=coordinate(x,y,c,zoom);
            if(q[0]<-.01||q[1]<-.01||q[0]>w-1+.01||q[1]>h-1+.01)throw std::runtime_error("LCP maps outside the automatic crop");
            const auto p=displayed(float(q[0]),float(q[1]),w,h,orientation);v[c]=sample(image,p[0],p[1],c);}
        const auto p=displayed(float(x),float(y),w,h,orientation);float* dst=output.data()+(size_t(uint32_t(p[1]))*image.width+uint32_t(p[0]))*3;
        for(int c=0;c<3;++c)dst[c]=float(to_working[c*3]*v[0]+to_working[c*3+1]*v[1]+to_working[c*3+2]*v[2]);
    }});
    image.rgb=std::move(output);LensCorrectionInfo info;info.available=info.applied=info.distortion=true;
    info.profile=profile.at("name").as_string();info.tca=tca;info.vignetting=vignette;info.scale=zoom;probe.metadata.lens_correction=std::move(info);return true;
}
}

void lens_database(const std::filesystem::path& directory) {
    std::lock_guard lock(database_mutex);database.reset();
    auto next=std::make_unique<lfDatabase>();
    const auto status=next->Load(path_utf8(directory).c_str());
    if(status!=LF_NO_ERROR){database_error="bundled lens database cannot be loaded";return;}
    database=std::move(next);database_error.clear();
}
LensCorrectionInfo inspect_lens(const Probe& probe) {
    std::lock_guard lock(database_mutex);
    try{return prepare(probe).info;}catch(const std::exception& e){LensCorrectionInfo i;i.reason=e.what();return i;}
}
bool correct_lens(FloatImage& image,Probe& probe,std::string& error,const spk::Json& imported) {
    try {
        std::lock_guard lock(database_mutex);
        if(image.width!=probe.width||image.height!=probe.height||image.width<2||image.height<2||
           image.rgb.size()!=size_t(image.width)*image.height*3)
            throw std::runtime_error("invalid lens input dimensions");
        if(!imported.is_null())return correct_lcp(image,probe,imported);
        auto correction=prepare(probe);
        if(!correction.info.available)throw std::runtime_error(correction.info.reason);
        if(!image.raw_metadata||image.raw_metadata->colour_channels!=3)throw std::runtime_error("lens correction requires a three-colour RAW decode");
        Matrix to_camera=identity,to_working=identity;
        if(correction.info.tca) {
            for(int r=0;r<3;++r)for(int c=0;c<3;++c)to_working[r*3+c]=image.raw_metadata->camera_to_output[r*4+c];
            to_camera=inverse(to_working);
        }
        const auto orientation=probe.metadata.orientation;
        const uint32_t w=orientation>=5?image.height:image.width,h=orientation>=5?image.width:image.height;
        auto& modifier=*correction.modifier;
        // Vignetting belongs at the distorted sample position, before the
        // geometric resampling. Float RGB retains negative/highlight values.
        // Reconstruct camera channels for TCA: shifting ProPhoto primaries
        // would shift mixtures of sensor channels and create coloured edges.
        parallel_rows(h,[&](uint32_t first,uint32_t last){
            std::vector<float> gains(size_t(w)*3,1.f);
            for(uint32_t y=first;y<last;++y) {
                std::fill(gains.begin(),gains.end(),1.f);
                if(correction.info.vignetting)modifier.ApplyColorModification(gains.data(),0,float(y),int(w),1,LF_CR_3(RED,GREEN,BLUE),int(w*3*sizeof(float)));
                for(uint32_t x=0;x<w;++x) {
                    const auto p=displayed(float(x),float(y),w,h,orientation);
                    float* pixel=image.rgb.data()+(size_t(uint32_t(p[1]))*image.width+uint32_t(p[0]))*3;
                    const std::array<float,3> v={pixel[0],pixel[1],pixel[2]};
                    for(int c=0;c<3;++c)pixel[c]=float(to_camera[c*3]*v[0]+to_camera[c*3+1]*v[1]+to_camera[c*3+2]*v[2])*gains[size_t(x)*3+c];
                }
            }
        });
        std::vector<float> output(image.rgb.size());
        parallel_rows(h,[&](uint32_t first,uint32_t last){
            std::vector<float> coordinates(size_t(w)*6);
            for(uint32_t y=first;y<last;++y) {
                if(!modifier.ApplySubpixelGeometryDistortion(0,float(y),int(w),1,coordinates.data()))
                    for(uint32_t x=0;x<w;++x)for(int c=0;c<3;++c){coordinates[size_t(x)*6+c*2]=float(x);coordinates[size_t(x)*6+c*2+1]=float(y);}
                for(uint32_t x=0;x<w;++x) {
                    std::array<float,3> v{};
                    for(int c=0;c<3;++c) {
                        const auto p=displayed(coordinates[size_t(x)*6+c*2],coordinates[size_t(x)*6+c*2+1],w,h,orientation);
                        v[c]=sample(image,p[0],p[1],c);
                    }
                    const auto p=displayed(float(x),float(y),w,h,orientation);
                    float* pixel=output.data()+(size_t(uint32_t(p[1]))*image.width+uint32_t(p[0]))*3;
                    for(int c=0;c<3;++c)pixel[c]=float(to_working[c*3]*v[0]+to_working[c*3+1]*v[1]+to_working[c*3+2]*v[2]);
                }
            }
        });
        image.rgb=std::move(output);correction.info.applied=true;probe.metadata.lens_correction=correction.info;return true;
    } catch(const std::exception& e){error=std::string(kUnsupportedPrefix)+"lens correction: "+e.what();return false;}
}
}
