# Hunt-Job Rebrand Summary

**Date:** April 23, 2026
**From:** Career-Ops
**To:** Hunt-Job

## Overview

The application has been rebranded from **Career-Ops** to **Hunt-Job** while maintaining full attribution to the original Career-Ops project. This fork extends the original Career-Ops with additional features and customizations for enhanced job search workflow.

## Files Renamed

| Old Name | New Name | Purpose |
|----------|----------|---------|
| `career-ops.bat` | `hunt-job.bat` | Windows launcher |
| `career-ops.sh` | `hunt-job.sh` | Unix/Linux/macOS launcher |
| `career-ops.js` | `hunt-job.js` | Universal Node.js launcher |

## Code Changes

### Source Files Updated
- All `src/` files updated with new branding
- CLI files (`src/cli/`) now display "Hunt-Job" in output
- Core modules (`src/core/`) display "Hunt-Job" in logs
- No functional changes — only naming

### Configuration Files Updated
- `package.json` - Updated project name and bin entry
- `CLAUDE.md` - Added attribution to Career-Ops
- `README.md` - Updated title with attribution
- `QUICKSTART.md` - Updated launcher commands

## Files Preserved (For Comparison)

The following files retain Career-Ops references for comparison purposes:
- **COMPARISON.md** - Feature comparison with original Career-Ops
- **VS_LINKEDIN.md** - Comparison with LinkedIn job search

These files help users understand what's different between this fork and the original project.

## Attribution

**Original Project:** Career-Ops
**Contributors:** Career-Ops Contributors
**This Fork:** Hunt-Job (Extended and customized version)

All original functionality is preserved. Enhancements include:
- File location pointers in CLI outputs
- Cross-platform launcher improvements
- Enhanced error handling
- Better workflow guidance

## How to Use After Rebrand

### Windows
```bash
hunt-job.bat
# or
npm start
```

### macOS/Linux
```bash
bash hunt-job.sh
# or
npm start
```

### Direct Commands
```bash
npm run evaluate-job          # Evaluate a job
npm run scan-portals          # Scan job portals
npm run generate-resume       # Generate resume
npm run prepare-interview     # Interview prep
npm run profile:init          # Initialize profile
npm run profile:edit          # Edit profile
```

## No Breaking Changes

- All existing workflows work identically
- All data files and formats remain the same
- API functionality unchanged
- Database/cache structure preserved

Users upgrading from Career-Ops can use this fork as a drop-in replacement with enhanced features.

---

**For detailed comparison with original Career-Ops, see:** [COMPARISON.md](COMPARISON.md)
