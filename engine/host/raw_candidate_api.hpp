// Copyright (C) 2026 shayt0ny. SPDX-License-Identifier: GPL-3.0-or-later
// Windows integration code; imported data retains its separate notices.
#pragma once
#include "image_io.hpp"

// Private same-build module ABI. Host and module are built together with the
// same compiler/CRT/options and header. No C++ allocation crosses ownership:
// the host copies a result, then calls the module's own release function.
namespace spkhost {
constexpr unsigned kRawCandidateAbi = 1;
struct RawCandidateRequest {
    unsigned abi = kRawCandidateAbi;
    size_t result_size = 0;
    const std::filesystem::path* path = nullptr;
    const DecodeOptions* options = nullptr;
    unsigned operation = 0; // 0 probe, 1 decode, 2 thumbnail
    uint32_t long_edge = 256;
    bool embedded_only = false;
};
struct RawCandidateResult {
    bool ok = false;
    Probe probe;
    FloatImage image;
    Rgba8 thumbnail;
    std::string source, error;
};
using RawCandidateRun = RawCandidateResult* (*)(const RawCandidateRequest*) noexcept;
using RawCandidateFree = void (*)(RawCandidateResult*) noexcept;

bool probe_file_impl(const std::filesystem::path&, Probe&, std::string&);
bool decode_linear_prophoto_impl(const std::filesystem::path&, const DecodeOptions&, FloatImage&, Probe&, std::string&);
bool thumbnail_impl(const std::filesystem::path&, uint32_t, Rgba8&, std::string&, std::string&, bool);
}
