#pragma once
#include <vulkan/vulkan_core.h>
#include <algorithm>
#include <array>
#include <cstdint>
#include <vector>

namespace spk::gpu {
struct VulkanMemoryCandidate { uint32_t index, heap; int score; uint64_t available; };

// memoryTypeBits is the buffer's compatibility contract. DEVICE_LOCAL is a
// preference, not a requirement for a storage buffer. A UMA driver may expose
// a small local heap alongside a much larger GPU-accessible system heap.
inline std::vector<VulkanMemoryCandidate> vulkan_memory_candidates(
    const VkPhysicalDeviceMemoryProperties& properties, uint32_t bits,
    const std::array<uint64_t,VK_MAX_MEMORY_HEAPS>& available, bool staging, bool readback) {
    std::vector<VulkanMemoryCandidate> candidates;
    for(uint32_t i=0;i<properties.memoryTypeCount;++i) {
        const auto& type=properties.memoryTypes[i];const auto flags=type.propertyFlags;
        if(!(bits&(1u<<i)) || type.heapIndex>=properties.memoryHeapCount ||
           (flags&(VK_MEMORY_PROPERTY_LAZILY_ALLOCATED_BIT|VK_MEMORY_PROPERTY_PROTECTED_BIT|
                   VK_MEMORY_PROPERTY_DEVICE_COHERENT_BIT_AMD|VK_MEMORY_PROPERTY_DEVICE_UNCACHED_BIT_AMD)))continue;
        if(staging && !(flags&VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT))continue;
        // The device-coherent AMD feature is not enabled by this backend.
        // Ordinary flags==0 GPU-accessible memory remains valid for compute;
        // only staging requires a CPU mapping.
        int score=0;
        if(staging) {
            if(readback && (flags&VK_MEMORY_PROPERTY_HOST_CACHED_BIT))score+=8;
            if(flags&VK_MEMORY_PROPERTY_HOST_COHERENT_BIT)score+=4;
            if(!(flags&VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT))score+=2;
        } else {
            if(flags&VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT)score+=100;
            if(!(flags&VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT))score+=1;
        }
        candidates.push_back({i,type.heapIndex,score,available[type.heapIndex]});
    }
    std::stable_sort(candidates.begin(),candidates.end(),[](const auto& a,const auto& b){return a.score>b.score;});
    return candidates;
}
}
