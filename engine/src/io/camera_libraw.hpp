#pragma once

#include "raw_camera.hpp"
#include <cmath>
#include <cstring>
#include <utility>

namespace spk::io {

// Keep LibRaw's decoder and matrix normalization. Supply a missing camera
// calibration only for an exact model, before unpack snapshots colour data.
class CameraLibRaw : public detail::CameraLibRaw {
public:
    using detail::CameraLibRaw::CameraLibRaw;

    template<class... Args> int open_file(Args&&... args) {
        const int status = LibRaw::open_file(std::forward<Args>(args)...);
        if (status == LIBRAW_SUCCESS) apply_missing_camera_profile();
        return status;
    }

    bool apply_missing_camera_profile() {
        const auto& id = imgdata.idata;
        if (id.maker_index != LIBRAW_CAMERAMAKER_Nikon || id.colors != 3 ||
            std::strcmp(id.normalized_model, "Z5_2") != 0) return false;
        // Future LibRaw and file-supplied profiles take precedence. Never
        // replace a non-empty matrix with our compatibility entry.
        for (const auto& row : imgdata.color.cam_xyz)
            for (float v : row) if (!std::isfinite(v) || v != 0) return false;
        for (int r = 0; r < 3; ++r) for (int c = 0; c < 4; ++c) {
            if (imgdata.color.cmatrix[r][c] != 0 ||
                imgdata.color.rgb_cam[r][c] != float(r == c)) return false;
        }
        // Nikon Z5 II D65 XYZ->camera matrix, not a neighbouring model's.
        // RawSpeed cameras.xml, CC BY-SA 3.0; attribution and pinned source:
        // engine/resources/io/Nikon-Z5-II-profile-NOTICE.txt.
        constexpr int values[3][3] = {{13133, -5542, -1280},
                                      {-4325, 12543, 1972}, {34, 792, 7662}};
        double matrix[4][3]{};
        for (int r = 0; r < 3; ++r) for (int c = 0; c < 3; ++c)
            matrix[r][c] = imgdata.color.cam_xyz[r][c] = float(values[r][c] / 10000.0);
        cam_xyz_coeff(imgdata.color.rgb_cam, matrix);
        libraw_internal_data.internal_output_params.raw_color = 0;
        return true;
    }
};

} // namespace spk::io
