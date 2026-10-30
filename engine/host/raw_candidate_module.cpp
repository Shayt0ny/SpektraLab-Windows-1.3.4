#include "raw_candidate_api.hpp"
#include <new>
#if defined(_WIN32)
#define SPK_CANDIDATE_EXPORT __declspec(dllexport)
#else
#define SPK_CANDIDATE_EXPORT __attribute__((visibility("default")))
#endif

extern "C" SPK_CANDIDATE_EXPORT spkhost::RawCandidateResult*
spk_raw_candidate_run(const spkhost::RawCandidateRequest* request) noexcept {
    using namespace spkhost;
    if (!request || request->abi != kRawCandidateAbi ||
        request->result_size != sizeof(RawCandidateResult) || !request->path) return nullptr;
    auto* result = new(std::nothrow) RawCandidateResult;
    if (!result) return nullptr;
    try {
        if (request->operation == 0)
            result->ok = probe_file_impl(*request->path, result->probe, result->error);
        else if (request->operation == 1 && request->options)
            result->ok = decode_linear_prophoto_impl(*request->path, *request->options, result->image, result->probe, result->error);
        else if (request->operation == 2)
            result->ok = thumbnail_impl(*request->path, request->long_edge, result->thumbnail, result->source, result->error, request->embedded_only);
        else result->error = "invalid candidate operation";
    } catch (...) {
        delete result;
        return nullptr; // No exception may escape the module boundary.
    }
    return result;
}

extern "C" SPK_CANDIDATE_EXPORT void
spk_raw_candidate_free(spkhost::RawCandidateResult* result) noexcept { delete result; }
