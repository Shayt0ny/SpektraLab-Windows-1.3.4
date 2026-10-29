#include "io/camera_libraw.hpp"
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>
#include <cstring>
#include <memory>
#include <iostream>

int main() {
    auto raw = std::make_unique<spk::io::CameraLibRaw>();
    auto& id = raw->imgdata.idata;
    id.maker_index = LIBRAW_CAMERAMAKER_Nikon;
    id.colors = 3;
    std::strcpy(id.normalized_model, "Z5_2");
    for(int r=0;r<3;r++) for(int c=0;c<4;c++) raw->imgdata.color.rgb_cam[r][c] = float(r==c);
    assert(raw->apply_missing_camera_profile());
    assert(raw->imgdata.color.cam_xyz[0][0] == 1.3133f);
    assert(raw->imgdata.color.pre_mul[0] > 0);
    assert(raw->imgdata.color.rgb_cam[0][0] != 1);
    assert(!raw->apply_missing_camera_profile());
    for(auto& row : raw->imgdata.color.cam_xyz) for(float& v:row) v=0;
    assert(!raw->apply_missing_camera_profile()); // real existing RGB matrix wins
    for(int r=0;r<3;r++) for(int c=0;c<4;c++) raw->imgdata.color.rgb_cam[r][c] = float(r==c);
    std::strcpy(id.normalized_model, "Z 8");
    assert(!raw->apply_missing_camera_profile());
    std::strcpy(id.normalized_model, "Z5_2");
    id.maker_index = LIBRAW_CAMERAMAKER_Sony;
    assert(!raw->apply_missing_camera_profile());
    id.maker_index = LIBRAW_CAMERAMAKER_Nikon;
    id.colors = 4;
    assert(!raw->apply_missing_camera_profile());
    std::cout << "camera profile: missing Z5 II calibration supplied; existing profiles, Z8, other makes and channel layouts preserved\n";
}
