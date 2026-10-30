#pragma once
#include "image_io.hpp"
#include <memory>
namespace spkhost {
struct CameraCurveTransform {
    std::array<float,9> matrix{};
    std::vector<float> table;
    uint32_t size=0;
    float domain=4;
};
// Installed/user-provided data only. No Adobe camera profile is redistributed.
spk::Json read_camera_profile(const std::vector<uint8_t>& bytes, const std::string& name);
spk::Json find_camera_profile(const spk::io::RawMetadata& raw);
std::shared_ptr<const CameraCurveTransform> prepare_camera_profile(
    const spk::Json& profile, const spk::io::RawMetadata& raw, double kelvin);
// Mutates only the owned float intermediate, never the source file. Called
// before engine_open, so both the film and original view read colored_raw.
void apply_camera_profile(FloatImage& colored_raw, const CameraCurveTransform& transform);
}
