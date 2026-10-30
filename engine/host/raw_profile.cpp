#include "raw_profile.hpp"
#include "tiff_ifd.hpp"
#include "platform.hpp"
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cctype>
#include <fstream>
#include <future>
#include <map>
#include <stdexcept>

namespace spkhost {
namespace {
using spk::Json;
using M=std::array<double,9>;
using V=std::array<double,3>;
std::string canonical(std::string s) {
    std::string out;for(unsigned char c:s)if(std::isalnum(c))out+=char(std::toupper(c));return out;
}
std::string camera_name(const spk::io::RawMetadata& raw) {
    const auto model=canonical(raw.model),make=canonical(raw.make);
    return model.starts_with(make)?model:make+model;
}
bool camera_matches(const std::string& model,const spk::io::RawMetadata& raw) {
    const auto name=canonical(model);return name==canonical(raw.model)||name==camera_name(raw);
}
M inverse(const M& a) {
    const double d=a[0]*(a[4]*a[8]-a[5]*a[7])-a[1]*(a[3]*a[8]-a[5]*a[6])+a[2]*(a[3]*a[7]-a[4]*a[6]);
    if(!std::isfinite(d)||std::abs(d)<1e-10)throw std::runtime_error("camera profile matrix is singular");
    return {(a[4]*a[8]-a[5]*a[7])/d,(a[2]*a[7]-a[1]*a[8])/d,(a[1]*a[5]-a[2]*a[4])/d,
        (a[5]*a[6]-a[3]*a[8])/d,(a[0]*a[8]-a[2]*a[6])/d,(a[2]*a[3]-a[0]*a[5])/d,
        (a[3]*a[7]-a[4]*a[6])/d,(a[1]*a[6]-a[0]*a[7])/d,(a[0]*a[4]-a[1]*a[3])/d};
}
M product(const M& a,const M& b){M c{};for(int r=0;r<3;++r)for(int k=0;k<3;++k)for(int x=0;x<3;++x)c[r*3+x]+=a[r*3+k]*b[k*3+x];return c;}
std::vector<double> values(const Json& p,int tag,size_t max=500000) {
    const auto& a=p.at("tags").at(std::to_string(tag));if(a.is_null())return {};
    if(!a.is_array()||a.items().size()>max)throw std::runtime_error("invalid camera profile table");
    std::vector<double> v;v.reserve(a.items().size());for(const auto& n:a.items()){
        if(!n.is_number()||!std::isfinite(n.as_double())||std::abs(n.as_double())>1e6)throw std::runtime_error("invalid camera profile number");v.push_back(n.as_double());}return v;
}
double scalar(const Json& p,int tag,double fallback){auto v=values(p,tag,1);return v.empty()?fallback:v[0];}
double illuminant(double id) {
    switch(int(id)){case 17:return 2850;case 18:return 4874;case 19:return 6774;case 20:return 5500;case 21:return 6500;case 22:return 7500;case 23:return 5000;case 24:return 3200;default:throw std::runtime_error("unsupported DCP calibration illuminant");}
}
double encode(double v){return v<=.0031308?12.92*v:1.055*std::pow(v,1/2.4)-.055;}
double decode(double v){return v<=.04045?v/12.92:std::pow((v+.055)/1.055,2.4);}
struct HueMap {
    int h=0,s=0,v=0,encoding=0;std::vector<double> table;
    HueMap(const Json& profile,int dims,int data,int enc) {
        auto d=values(profile,dims,3);table=values(profile,data);
        if(table.empty())return;
        if(d.size()!=3)throw std::runtime_error("invalid DCP map dimensions");
        for(double n:d)if(n!=std::trunc(n)||n<1||n>256)throw std::runtime_error("invalid DCP map dimension");
        h=int(d[0]);s=int(d[1]);v=int(d[2]);encoding=int(scalar(profile,enc,0));
        if(h<1||s<2||uint64_t(h)*s*v*3!=table.size()||(encoding!=0&&encoding!=1))throw std::runtime_error("invalid DCP map size or encoding");
    }
    V apply(V rgb) const {
        if(table.empty())return rgb;
        const double high=*std::max_element(rgb.begin(),rgb.end()),low=*std::min_element(rgb.begin(),rgb.end()),delta=high-low;
        double hue=0,sat=high>0?delta/high:0;
        if(delta>1e-15){int c=int(std::max_element(rgb.begin(),rgb.end())-rgb.begin());hue=(rgb[(c+1)%3]-rgb[(c+2)%3])/delta+c*2;if(hue<0)hue+=6;}
        const double hh=hue*h/6,ss=std::clamp(sat,0.,1.)*(s-1),vv=std::clamp(encoding?encode(high):high,0.,1.)*(v-1);
        int h0=int(std::floor(hh))%h,s0=std::min(int(ss),s-2),v0=v>1?std::min(int(vv),v-2):0;
        const double dh=hh-std::floor(hh),ds=ss-s0,dv=vv-v0;V change{};
        for(int z=0;z<(v>1?2:1);++z)for(int y=0;y<2;++y)for(int x=0;x<2;++x){
            const double weight=(x?dh:1-dh)*(y?ds:1-ds)*(v>1?(z?dv:1-dv):1);
            size_t at=((size_t(v0+z)*h+(h0+x)%h)*s+s0+y)*3;for(int c=0;c<3;++c)change[c]+=table[at+c]*weight;
        }
        hue=std::fmod(hue+change[0]/60+6000,6.);sat=std::clamp(sat*change[1],0.,1.);
        const double val=encoding?decode(std::max(0.,encode(high)*change[2])):high*change[2];
        const double chroma=val*sat,x=chroma*(1-std::abs(std::fmod(hue,2.)-1)),m=val-chroma;
        const V colors[6]={{chroma,x,0},{x,chroma,0},{0,chroma,x},{0,x,chroma},{x,0,chroma},{chroma,0,x}};
        auto out=colors[std::clamp(int(hue),0,5)];for(double& n:out)n+=m;return out;
    }
};
#include "raw_profile_curve.inc"
}

Json read_camera_profile(const std::vector<uint8_t>& bytes,const std::string& name) {
    if(bytes.size()<8||bytes.size()>8*1024*1024)throw std::runtime_error("DCP must be between 8 bytes and 8 MB");
    TiffBytes t(bytes.data(),bytes.size());uint32_t offset=0;
    if(!t.header(offset,true))throw std::runtime_error("invalid DCP header");
    TiffBytes::Ifd ifd;if(!t.read_ifd(offset,ifd))throw std::runtime_error("invalid DCP directory");
    Json p=Json::object(),tags=Json::object();p.set("version",Json(1.));p.set("name",Json(name));
    std::string model,description,copyright;t.text(ifd,50708,model);t.text(ifd,50936,description);t.text(ifd,50942,copyright);
    if(model.empty())throw std::runtime_error("DCP has no camera model");
    p.set("camera",Json(model));p.set("description",Json(description));p.set("copyright",Json(copyright));
    for(int tag:{50778,50779,50937,50938,50939,50940,50964,50965,50981,50982,51107,51108,51109}) {
        if(!ifd.count(tag))continue;std::vector<double> v;if(!t.numbers(ifd,uint16_t(tag),v)||v.size()>500000)throw std::runtime_error("invalid DCP table");
        Json a=Json::array();for(double n:v){if(!std::isfinite(n))throw std::runtime_error("non-finite DCP value");a.push(Json(n));}tags.set(std::to_string(tag),std::move(a));
    }
    p.set("tags",std::move(tags));
    if(values(p,50964,9).size()!=9&&values(p,50965,9).size()!=9)throw std::runtime_error("this DCP has no supported forward matrix");
    return p;
}

Json find_camera_profile(const spk::io::RawMetadata& raw) {
    std::vector<std::filesystem::path> roots;
    if(const char* p=std::getenv("ProgramFiles"))roots.push_back(utf8_path(p)/"Adobe/Adobe Lightroom Classic/Resources/CameraProfiles/Adobe Standard");
    for(const char* variable:{"PROGRAMDATA","APPDATA"})if(const char* p=std::getenv(variable))roots.push_back(utf8_path(p)/"Adobe/CameraRaw/CameraProfiles");
    std::vector<std::filesystem::path> candidates;const auto camera=camera_name(raw);
    for(const auto& root:roots){std::error_code ec;if(!std::filesystem::is_directory(root,ec))continue;
        for(std::filesystem::recursive_directory_iterator it(root,std::filesystem::directory_options::skip_permission_denied,ec),end;it!=end;it.increment(ec)){
            if(ec){ec.clear();continue;}if(!it->is_regular_file(ec))continue;
            const auto file=canonical(path_utf8(it->path().stem()));
            if(it->path().extension()==".dcp"&&(file==camera+"ADOBESTANDARD"||file==camera+"ADOBESTANDARDV2"))candidates.push_back(it->path());
        }
    }
    std::sort(candidates.rbegin(),candidates.rend());
    for(const auto& path:candidates){std::error_code ec;auto n=std::filesystem::file_size(path,ec);if(ec||n>8*1024*1024)continue;
        std::ifstream f(path,std::ios::binary);std::vector<uint8_t> bytes(n);if(!f.read(reinterpret_cast<char*>(bytes.data()),std::streamsize(n)))continue;
        auto profile=read_camera_profile(bytes,path_utf8(path.filename()));if(camera_matches(profile.at("camera").as_string(),raw))return profile;
    }
    return {};
}

std::shared_ptr<const CameraCurveTransform> prepare_camera_profile(const Json& p,const spk::io::RawMetadata& raw,double kelvin) {
    if(!p.is_object()||p.at("version").as_double()!=1||!camera_matches(p.at("camera").as_string(),raw)||raw.colour_channels!=3)
        throw std::runtime_error("camera profile does not match this RAW camera");
    auto a=values(p,50964,9),b=values(p,50965,9);if(a.empty())a=b;if(b.empty())b=a;
    if(a.size()!=9||b.size()!=9)throw std::runtime_error("invalid DCP forward matrix");
    double weight=1;
    if(p.at("tags").has("50778")&&p.at("tags").has("50779")){
        const double k1=illuminant(scalar(p,50778,21)),k2=illuminant(scalar(p,50779,21));
        if(std::abs(k1-k2)>1)weight=std::clamp((1/std::clamp(kelvin,2000.,50000.)-1/k2)/(1/k1-1/k2),0.,1.);
    }
    M forward{},camera{};for(int i=0;i<9;++i)forward[i]=weight*a[i]+(1-weight)*b[i];
    for(int r=0;r<3;++r)for(int c=0;c<3;++c)camera[r*3+c]=raw.camera_to_output[r*4+c];
    const M prophoto={.7976749,.1351917,.0313534,.2880402,.7118741,.0000857,0,0,.82521};
    const auto matrix=product(product(inverse(prophoto),forward),inverse(camera));
    auto out=std::make_shared<CameraCurveTransform>();for(int i=0;i<9;++i)out->matrix[i]=float(matrix[i]);
    HueMap hsm(p,50937,50938,51107),second(p,50937,50939,51107),look(p,50981,50982,51108);
    if(hsm.table.empty())hsm=second;
    else if(!second.table.empty()) {if(hsm.table.size()!=second.table.size())throw std::runtime_error("DCP illuminant map mismatch");for(size_t i=0;i<hsm.table.size();++i)hsm.table[i]=weight*hsm.table[i]+(1-weight)*second.table[i];}
    auto tone=values(p,50940,8192);
    if(tone.empty()&&p.at("copyright").as_string().find("Adobe Systems")!=std::string::npos)
        for(size_t i=0;i<std::size(raw_profile_default_curve);++i){tone.push_back(double(i)/(std::size(raw_profile_default_curve)-1));tone.push_back(raw_profile_default_curve[i]);}
    if(!tone.empty()){
        if(tone.size()<4||tone.size()%2)throw std::runtime_error("invalid DCP tone curve");
        for(size_t i=0;i<tone.size();i+=2)if(tone[i]<0||tone[i]>1||tone[i+1]<0||tone[i+1]>1||(i&&tone[i]<=tone[i-2]))throw std::runtime_error("invalid DCP tone knots");
    }
    auto curve=[&](double x){if(tone.empty())return x;if(x<=tone[0])return tone[1];if(x>=tone[tone.size()-2])return tone.back();
        size_t low=0,high=tone.size()/2-1;while(high-low>1){auto mid=(low+high)/2;if(tone[mid*2]<x)low=mid;else high=mid;}
        return tone[low*2+1]+(tone[high*2+1]-tone[low*2+1])*(x-tone[low*2])/(tone[high*2]-tone[low*2]);};
    const double exposure=std::exp2(std::clamp(scalar(p,51109,0),-10.,10.));
    out->size=65;out->domain=4;out->table.reserve(size_t(out->size)*out->size*out->size*3);
    for(uint32_t z=0;z<out->size;++z)for(uint32_t y=0;y<out->size;++y)for(uint32_t x=0;x<out->size;++x){
        auto shape=[&](uint32_t n){return out->domain*std::pow(double(n)/(out->size-1),3);};V rgb={shape(x),shape(y),shape(z)};
        rgb=hsm.apply(rgb);for(double& n:rgb)n*=exposure;rgb=look.apply(rgb);
        const double lo=*std::min_element(rgb.begin(),rgb.end()),hi=*std::max_element(rgb.begin(),rgb.end()),cl=curve(lo),ch=curve(hi);
        if(!tone.empty())for(double& n:rgb)n=hi>lo?cl+(n-lo)*(ch-cl)/(hi-lo):ch;
        for(double n:rgb){if(!std::isfinite(n))throw std::runtime_error("non-finite DCP transform");out->table.push_back(float(n));}
    }
    return out;
}

void apply_camera_profile(FloatImage& colored_raw,const CameraCurveTransform& t) {
    const size_t pixels=size_t(colored_raw.width)*colored_raw.height;
    if(!pixels||colored_raw.rgb.size()!=pixels*3||t.size<2||t.table.size()!=size_t(t.size)*t.size*t.size*3)
        throw std::runtime_error("invalid camera-curve intermediate");
    const unsigned workers=std::min({8u,hardware_threads(),unsigned(std::max(size_t(1),pixels/16384))});
    auto rows=[&](size_t first,size_t last){for(size_t i=first;i<last;++i){
        const auto* src=colored_raw.rgb.data()+i*3;std::array<double,3> p{},f{};std::array<uint32_t,3> lo{};
        for(int c=0;c<3;++c){const double v=t.matrix[c*3]*src[0]+t.matrix[c*3+1]*src[1]+t.matrix[c*3+2]*src[2];
            if(!std::isfinite(v))throw std::runtime_error("camera curve received non-finite RAW pixels");
            p[c]=std::cbrt(std::clamp(v/t.domain,0.,1.))*(t.size-1);lo[c]=std::min(uint32_t(p[c]),t.size-2);f[c]=p[c]-lo[c];}
        std::array<double,3> result{};
        for(uint32_t z=0;z<2;++z)for(uint32_t y=0;y<2;++y)for(uint32_t x=0;x<2;++x){
            const double weight=(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]);
            const size_t at=((size_t(lo[2]+z)*t.size+lo[1]+y)*t.size+lo[0]+x)*3;
            for(int c=0;c<3;++c)result[c]+=t.table[at+c]*weight;
        }
        for(int c=0;c<3;++c)colored_raw.rgb[i*3+c]=float(result[c]);
    }};
    std::vector<std::future<void>> tasks;const size_t step=(pixels+workers-1)/workers;
    for(unsigned w=0;w<workers;++w){auto begin=w*step,end=std::min(pixels,begin+step);if(begin<end)tasks.push_back(std::async(std::launch::async,rows,begin,end));}
    for(auto& task:tasks)task.get();
}
}
