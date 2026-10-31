# Canon ColorData 66 shares the 3778-word length with version 48, but uses
# ColorData12 black/white offsets. Keep pinned vendor trees untouched and
# compile a generated copy with this narrow metadata correction in both libs.
# Upstream diagnosis: https://github.com/LibRaw/LibRaw/issues/821
function(spk_canon_colordata sources_var source_root decoder)
    set(source "${source_root}/src/metadata/canon.cpp")
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${source}")
    file(READ "${source}" code)
    set(anchor "    if (offsetChannelBlackLevel)\n")
    string(FIND "${code}" "${anchor}" found)
    if(found LESS 0)
        message(FATAL_ERROR "Review Canon ColorData compatibility patch for ${decoder}")
    endif()
    set(fix [=[
    // SpektraLab: EOS R6 Mark III, ColorDataSubVer 66. Read the version
    // from the record, never infer black levels from model, ISO or pixels.
    if (len == 3778)
    {
      const INT64 position = ftell(ifp);
      fseek(ifp, save1, SEEK_SET);
      const unsigned version = get2();
      fseek(ifp, position, SEEK_SET);
      if (version == 66)
      {
        imCanon.ColorDataVer = 12;
        offsetChannelBlackLevel2 = save1 + ((0x0069+0x0116) << 1);
        offsetChannelBlackLevel  = save1 + ((0x0069+0x0227) << 1);
        offsetWhiteLevels        = save1 + ((0x0069+0x022b) << 1);
      }
    }

]=])
    string(REPLACE "${anchor}" "${fix}${anchor}" code "${code}")
    # canon.cpp's relative include needs the pinned source's own internals.
    string(REPLACE "../../internal/" "${source_root}/internal/" code "${code}")
    set(output "${CMAKE_CURRENT_BINARY_DIR}/generated/${decoder}/canon.cpp")
    file(CONFIGURE OUTPUT "${output}" CONTENT "${code}" @ONLY)
    set(sources "${${sources_var}}")
    list(REMOVE_ITEM sources "${source}")
    list(APPEND sources "${output}")
    set(${sources_var} "${sources}" PARENT_SCOPE)
endfunction()
