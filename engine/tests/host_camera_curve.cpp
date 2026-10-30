#include "raw_profile.hpp"
#include <cmath>
#include <iostream>
#include <stdexcept>
using spk::Json;
using namespace spkhost;
void require(bool b,const char* text){if(!b)throw std::runtime_error(text);}
Json table(std::initializer_list<double> v){Json a=Json::array();for(double n:v)a.push(Json(n));return a;}
int main(){try{
    Json p=Json::object(),tags=Json::object();p.set("version",Json(1.));p.set("camera",Json(std::string("Owned Camera")));
    tags.set("50964",table({.7976749,.1351917,.0313534,.2880402,.7118741,.0000857,0,0,.82521}));
    tags.set("50940",table({0,0,.5,.75,1,1}));p.set("tags",tags);
    spk::io::RawMetadata raw;raw.model="Owned Camera";raw.colour_channels=3;raw.camera_to_output={1,0,0,0,0,1,0,0,0,0,1,0};
    FloatImage original;original.width=8;original.height=4;original.rgb.resize(8*4*3,.25f);original.raw_metadata=raw;
    auto colored_raw=original;const auto curve=prepare_camera_profile(p,raw,5500);apply_camera_profile(colored_raw,*curve);
    for(float n:colored_raw.rgb)require(std::abs(n-.375f)<.002f,"known tone curve was not applied to the float intermediate");
    require(original.rgb[0]==.25f,"original buffer was overwritten");
    tags.set("50940",table({0,0,1,1}));p.set("tags",tags);auto identity=original;apply_camera_profile(identity,*prepare_camera_profile(p,raw,5500));
    for(float n:identity.rgb)require(std::abs(n-.25f)<.001f,"identity camera calibration moved neutral input");
    tags.set("50940",table({0,0,.5,.75,1,1}));p.set("tags",tags);
    // A chromatic input must retain colour ratios when only the tone curve changes.
    auto color=original;for(size_t i=0;i<color.rgb.size();i+=3){color.rgb[i]=.1f;color.rgb[i+1]=.2f;color.rgb[i+2]=.3f;}
    apply_camera_profile(color,*prepare_camera_profile(p,raw,5500));
    require(color.rgb[0]<color.rgb[1]&&color.rgb[1]<color.rgb[2],"tone curve inverted colour order");
    require(std::abs((color.rgb[1]-color.rgb[0])/(color.rgb[2]-color.rgb[0])-.5f)<.01f,"tone interpolation changed hue");
    raw.model="Wrong Camera";bool rejected=false;try{prepare_camera_profile(p,raw,5500);}catch(...){rejected=true;}require(rejected,"mismatched camera accepted");
    rejected=false;try{read_camera_profile({1,2,3},"bad.dcp");}catch(...){rejected=true;}require(rejected,"truncated DCP accepted");
    std::cout<<"camera profile: known curve, independent intermediate, neutral calibration, hue and invalid camera/file passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
