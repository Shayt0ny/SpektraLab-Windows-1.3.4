#pragma once
#include <libraw/libraw_types.h>
#include <cstdint>
#include <string_view>

namespace spk::io {

struct RawActiveArea {
    uint32_t left = 0, top = 0, width = 0, height = 0;
    bool corrected = false;
};

// LibRaw 0.22.2 does not list the ILCE-7RM6 in its model table. It exposes
// the padded ARW storage plane as the visible frame, despite parsing the
// camera's explicit inset crop. Limit the compatibility correction to that
// camera and the uncropped storage layout; never infer a crop from dark pixels
// or change another camera's established decode policy.
inline RawActiveArea camera_active_area(std::string_view make, std::string_view model,
                                       const libraw_image_sizes_t& sizes) {
    RawActiveArea area{0, 0, sizes.width, sizes.height, false};
    if (make != "Sony" || model != "ILCE-7RM6" || sizes.top_margin || sizes.left_margin ||
        sizes.width != sizes.raw_width || sizes.height != sizes.raw_height) return area;
    const auto& crop = sizes.raw_inset_crops[0];
    if (!crop.cwidth || !crop.cheight || crop.cleft == 0xffff || crop.ctop == 0xffff ||
        uint32_t(crop.cleft) + crop.cwidth > sizes.width ||
        uint32_t(crop.ctop) + crop.cheight > sizes.height) return area;
    if (crop.cwidth == sizes.width && crop.cheight == sizes.height) return area;
    return {crop.cleft, crop.ctop, crop.cwidth, crop.cheight, true};
}

}  // namespace spk::io
