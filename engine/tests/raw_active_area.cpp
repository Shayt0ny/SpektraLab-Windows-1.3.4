#include "io/raw_active_area.hpp"
#include <cstdio>

int main() {
    libraw_image_sizes_t sizes{};
    sizes.width = sizes.raw_width = 10240;
    sizes.height = sizes.raw_height = 7168;
    sizes.raw_inset_crops[0] = {12, 8, 9984, 6656};
    auto area = spk::io::camera_active_area("Sony", "ILCE-7RM6", sizes);
    if (!area.corrected || area.left != 12 || area.top != 8 || area.width != 9984 || area.height != 6656) return 1;
    // Existing cameras and already cropped frames must retain their policy.
    if (spk::io::camera_active_area("Sony", "ILCE-7RM5", sizes).corrected ||
        spk::io::camera_active_area("Other", "ILCE-7RM6", sizes).corrected) return 2;
    auto cropped = sizes;
    cropped.width = 9984; cropped.height = 6656;
    if (spk::io::camera_active_area("Sony", "ILCE-7RM6", cropped).corrected) return 3;
    auto invalid = sizes;
    invalid.raw_inset_crops[0].cleft = 0xffff;
    if (spk::io::camera_active_area("Sony", "ILCE-7RM6", invalid).corrected) return 4;
    invalid = sizes;
    invalid.raw_inset_crops[0].cwidth = 10240;
    if (spk::io::camera_active_area("Sony", "ILCE-7RM6", invalid).corrected) return 5;
    invalid = sizes;
    invalid.raw_inset_crops[0].cheight = 0;
    if (spk::io::camera_active_area("Sony", "ILCE-7RM6", invalid).corrected) return 6;
    std::puts("active area: camera metadata, model isolation, already cropped, sentinel and bounds passed");
    return 0;
}
