// Local Post-Dev masks: bounded analytic shapes and derived brush coverage.
// No measured film/paper response or cached print pixels are changed.
#pragma once
#include "view_process.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <stdexcept>

namespace spk::view {
struct LocalMasks { std::vector<float> config, rasters{0.f}; uint32_t count=0; };
inline double mask_number(const Json& j,const char* key,double lo,double hi) {
    const auto& v=j.at(key);if(!v.is_number()||!std::isfinite(v.as_double())||v.as_double()<lo||v.as_double()>hi)throw std::runtime_error(std::string("view: invalid mask ")+key);return v.as_double();
}
inline bool mask_bool(const Json& j,const char* key){const auto& v=j.at(key);if(!v.is_bool())throw std::runtime_error(std::string("view: invalid mask ")+key);return v.as_bool();}
inline float mask_smooth(float a,float b,float x){float t=std::clamp((x-a)/std::max(b-a,1e-6f),0.f,1.f);return t*t*(3-2*t);}
inline LocalMasks prepare_local_masks(const Json& json,uint32_t width,uint32_t height){
    LocalMasks out;if(json.is_null())return out;
    if(!json.is_array()||json.items().size()>8)throw std::runtime_error("view: at most eight local masks are allowed");
    size_t total_points=0;
    for(const auto& m:json.items()){
        if(!m.is_object())throw std::runtime_error("view: invalid local mask");
        std::array<float,32> p{};const auto kind=m.at("kind").as_string();
        if(kind!="linear"&&kind!="radial"&&kind!="brush")throw std::runtime_error("view: unsupported local mask kind");
        p[0]=kind=="linear"?0:kind=="radial"?1:2;p[1]=mask_bool(m,"enabled")?1:0;p[2]=float(mask_number(m,"amount",0,1));p[3]=mask_bool(m,"inverted")?1:0;p[4]=float(mask_number(m,"feather",0,1));
        p[5]=float(mask_number(m.at("start"),"x",0,1));p[6]=float(mask_number(m.at("start"),"y",0,1));p[7]=float(mask_number(m.at("end"),"x",0,1));p[8]=float(mask_number(m.at("end"),"y",0,1));p[9]=float(mask_number(m,"radius",.002,.4));
        const char* keys[]={"exposure","contrast","brightness","saturation","temperature","tint","highlights","shadows"};
        const auto& grade=m.at("adjustments");if(!grade.is_object())throw std::runtime_error("view: invalid mask grade");
        for(const auto& kv:grade.fields())if(std::find(std::begin(keys),std::end(keys),kv.first)==std::end(keys))throw std::runtime_error("view: unsupported local adjustment");
        for(size_t k=0;k<8;k++){double limit=k==0?3:(k==1||k==2)?50:100;p[16+k]=float(mask_number(grade,keys[k],-limit,limit));}
        const auto& strokes=m.at("strokes");if(!strokes.is_array()||strokes.items().size()>128)throw std::runtime_error("view: invalid mask strokes");
        const double scale=1024./std::max(width,height);uint32_t w=std::max(1u,uint32_t(std::lround(width*scale))),h=std::max(1u,uint32_t(std::lround(height*scale)));
        std::vector<float> raster;if(kind=="brush")raster.resize(size_t(w)*h);
        auto stamp=[&](double x,double y,double radius,bool erase){
            float r=float(radius*std::min(w,h)),cx=float(x*w),cy=float(y*h);
            int x0=std::max(0,int(std::floor(cx-r))),x1=std::min(int(w),int(std::ceil(cx+r))),y0=std::max(0,int(std::floor(cy-r))),y1=std::min(int(h),int(std::ceil(cy+r)));
            for(int yy=y0;yy<y1;yy++)for(int xx=x0;xx<x1;xx++){
                float d=std::hypot(xx+.5f-cx,yy+.5f-cy)/r,c=1-mask_smooth(std::max(0.f,1-p[4]),1,d);auto& v=raster[size_t(yy)*w+xx];v=erase?std::min(v,1-c):std::max(v,c);
            }
        };
        for(const auto& stroke:strokes.items()){
            const bool erase=mask_bool(stroke,"erase");const double radius=mask_number(stroke,"radius",.002,.4);const auto& pts=stroke.at("points");
            if(!pts.is_array()||pts.items().empty()||pts.items().size()>1024||(total_points+=pts.items().size())>8192)throw std::runtime_error("view: brush point limit exceeded");
            double ax=0,ay=0;bool first=true;
            for(const auto& pt:pts.items()){
                double x=mask_number(pt,"x",0,1),y=mask_number(pt,"y",0,1);
                if(kind=="brush"){
                    if(first)stamp(x,y,radius,erase);else{double distance=std::hypot((x-ax)*w,(y-ay)*h);unsigned steps=std::max(1u,unsigned(std::ceil(distance/std::max(1.,radius*std::min(w,h)*.3))));
                        for(unsigned i=1;i<=steps;i++)stamp(ax+(x-ax)*i/steps,ay+(y-ay)*i/steps,radius,erase);}
                }
                ax=x;ay=y;first=false;
            }
        }
        if(kind=="brush"){p[10]=float(out.rasters.size());p[11]=float(w);p[12]=float(h);out.rasters.insert(out.rasters.end(),raster.begin(),raster.end());}
        out.config.insert(out.config.end(),p.begin(),p.end());out.count++;
    }
    return out;
}
inline bool apply_local_masks(gpu::Gpu* gpu,Image& image,const LocalMasks& masks,std::string& error){
    if(!masks.count)return true;auto cfg=gpu->upload(masks.config.data(),masks.config.size()*sizeof(float),error);if(!cfg)return false;
    auto raster=gpu->upload(masks.rasters.data(),masks.rasters.size()*sizeof(float),error);if(!raster)return false;
    uint32_t meta[]={uint32_t(image.pixels()),image.w,image.h,masks.count};
    return gpu->dispatch("spk_view_local_masks",{gpu::Arg::buf(image.buf),gpu::Arg::buf(cfg),gpu::Arg::buf(raster),gpu::Arg::inline_bytes(meta,4)},image.pixels(),error)&&gpu->flush(error);
}
}
