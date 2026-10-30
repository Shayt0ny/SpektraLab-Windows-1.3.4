// Diagnostic/regression mosaic dumper. No source RAW is modified.
#include "io/camera_libraw.hpp"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <stdexcept>

int main(int argc, char** argv) {
    try {
        if (argc != 3) throw std::runtime_error("usage: spk_raw_nikon_he input.nef new-mosaic.u16");
        const auto path = std::filesystem::u8path(argv[1]);
        const auto destination = std::filesystem::u8path(argv[2]);
        if (std::filesystem::exists(destination)) throw std::runtime_error("output already exists");
        auto raw = std::make_unique<spk::io::CameraLibRaw>();
        int status = raw->open_file(path.c_str());
        if (status) throw std::runtime_error(LibRaw::strerror(status));
        status = raw->unpack();
        if (status) throw std::runtime_error(LibRaw::strerror(status));
        const auto& data = raw->imgdata;
        if (raw->error_count() || !data.rawdata.raw_image || data.sizes.raw_pitch != data.sizes.raw_width * 2)
            throw std::runtime_error("invalid or non-tight integer mosaic");
        std::ofstream file(destination, std::ios::binary);
        const auto bytes = size_t(data.sizes.raw_width) * data.sizes.raw_height * 2;
        if (!file.write(reinterpret_cast<const char*>(data.rawdata.raw_image), bytes))
            throw std::runtime_error("cannot write mosaic");
        std::cout << "{\"width\":" << data.sizes.raw_width << ",\"height\":" << data.sizes.raw_height
                  << ",\"compression\":" << data.makernotes.nikon.NEFCompression
                  << ",\"decoder\":\"" << raw->unpack_function_name() << "\"}\n";
    } catch(const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
