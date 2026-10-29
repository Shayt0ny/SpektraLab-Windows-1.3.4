// Real Vulkan allocation tests under a small per-engine limit. No desktop-wide
// OOM is required to exercise reclaim, refusal and subsequent recovery.
#include "gpu/gpu.hpp"
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <string>

namespace {
constexpr size_t MiB = size_t(1) << 20;
bool require(bool condition, const char* message) {
    if (!condition) std::fprintf(stderr, "memory: %s\n", message);
    return condition;
}
}

int main(int argc, char** argv) {
    if (argc != 2) return 2;
#ifdef _WIN32
    _putenv_s("SPEKTRAFILM_VULKAN_MEMORY_LIMIT_MB", "64");
#else
    setenv("SPEKTRAFILM_VULKAN_MEMORY_LIMIT_MB", "64", 1);
#endif
    std::string error;
    std::unique_ptr<spk::gpu::Gpu> gpu(spk::gpu::Gpu::create_vulkan(std::string(argv[1]) + "/vulkan", error));
    if (!require(bool(gpu), error.c_str())) return 1;

    auto large = gpu->alloc(8 * MiB, error);
    if (!require(bool(large), error.c_str())) return 1;
    large.reset();
    auto tiny = gpu->alloc(64, error);
    if (!require(bool(tiny) && gpu->size_bytes(tiny.get()) <= 4096,
                 "a tiny parameter consumed a full image plane")) return 1;
    tiny.reset();

    auto live = gpu->alloc_zeroed(4096, error);
    auto persistent = gpu->alloc_persistent(4096, error);
    if (!require(bool(live) && bool(persistent), error.c_str())) return 1;
    // Upstream retains reusable planes between frames; explicit export/cache
    // cleanup owns reclamation, rather than making every edit reallocate.
    gpu->trim_pool(0);
    gpu->begin_frame();
    if (!require(gpu->pool_stats().free_bytes == 0 && gpu->pool_stats().live_bytes == 4096 &&
                 gpu->pool_stats().persistent_bytes == 4096,
                 "pre-render cleanup kept idle planes or freed a live buffer")) return 1;
    uint32_t value = 1;
    if (!require(gpu->read(live.get(), 0, &value, sizeof value, error) && value == 0,
                 "cleanup changed a live buffer's pixels")) return 1;
    live.reset();
    persistent.reset();
    gpu->end_frame();
    gpu->trim_pool(0);
    if (!require(gpu->pool_stats().total_bytes == 0, "end_frame retained dead render planes")) return 1;

    auto idle = gpu->alloc(40 * MiB, error);
    if (!require(bool(idle), error.c_str())) return 1;
    idle.reset();
    auto replacement = gpu->alloc(48 * MiB, error);
    if (!require(bool(replacement) && error.empty() && gpu->pool_stats().total_bytes == 48 * MiB,
                 "allocation did not reclaim an incompatible idle plane and retry")) return 1;
    replacement.reset();
    auto kept = gpu->alloc_persistent(16 * MiB, error);
    if (!require(bool(kept), error.c_str())) return 1;
    auto refused = gpu->alloc(56 * MiB, error);
    if (!require(!refused && error.find("GPU memory budget exhausted") != std::string::npos &&
                 gpu->pool_stats().persistent_bytes == 16 * MiB && gpu->pool_stats().total_bytes == 0,
                 "over-budget request was accepted or destroyed persistent data")) return 1;
    if (!require(gpu->take_critical_pressure() && !gpu->take_critical_pressure(),
                 "memory-pressure signal was not one-shot")) return 1;
    kept.reset();
    error.clear();
    auto recovered = gpu->alloc(56 * MiB, error);
    if (!require(bool(recovered), "backend could not recover after releasing pressure")) return 1;
    recovered.reset();
    gpu->end_frame();
    gpu->trim_pool(0);
    std::puts("memory: bounded reuse, pre/post-render cleanup, reclaim/retry, safe refusal and recovery passed");
    return 0;
}
