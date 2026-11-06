---
name: upscale-photos
description: Upscale low-resolution or compressed local photos into sharper, larger versions. Use when the user asks to upscale, enlarge or improve the quality of photos, including listing photos for carousels.
---

# Upscale photos

Use the `photo-upscaler` tools. They run on the user's computer, so photos stay local.

1. If this is the first use in the conversation, or an upscale failed, call `system_check`.
2. Call `upscale_image` once per photo, one at a time. Use `natural` mode and `scale: 2` unless the user asks otherwise. Use `fast` mode for previews or if `natural` is too slow.
3. Report the output path, time taken and backend for each photo.

The AI improves apparent detail but cannot recover what the source lost. Don't describe results as restoring the original. A low `fidelity.worstTilePsnr` compared with other photos means that part of the image changed the most, so look there first. These scores don't prove nothing was invented.

Before the user publishes altered property photos, remind them they need rights to the photos and may have disclosure duties.
