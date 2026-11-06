# Build plan: installable Claude photo upscaler and carousel maker

Replaces the build plan, costs and photo-sourcing sections of the research report.

## Goal

Anyone can install this into Claude in about a minute, point it at low-quality photos, and get back photos that look beautiful without looking fake. It works on any photo, with real estate as the main use and a dedicated carousel preset.

## Requirements

- **No per-photo cost:** everything runs on the user's computer. No paid APIs, and photos never leave their machine unless they send them to Claude.
- **Easy install:** no Python, CUDA, drivers or terminal for users.
- **Works on ordinary computers:** uses the GPU when possible and falls back to CPU, slower but still working.
- **Input:** files, a folder, or a listing link the user opens in their own browser (see below). No server-side scraper.
- **Commercial option kept open:** the code is all rights reserved for now, and every dependency and dataset must allow commercial use and redistribution.

## Proof of concept results (November 2026)

Tested on this Snapdragon X Elite PC with one CC0 interior photo, shrunk to 1024x682 and JPEG-compressed to simulate a listing photo, then upscaled 2x.

| Mode | Graphics (DirectML) | CPU | Accuracy vs the true photo (PSNR) |
|---|---|---|---|
| Plain Lanczos resize | n/a | n/a | 26.15 dB |
| Fast (General-x4v3) | 9.5 s | 11 s | 27.03 dB |
| Natural (Real-ESRGAN x4plus) | 92 s | 131 s | 27.80 dB |

- **Confirmed:** DirectML runs on the Adreno GPU from Node, and graphics and CPU results match. The packed bundle runs over MCP, and `claude plugin validate` passes.
- **Not yet tested:** the plugin running inside a real Claude session (the command-line login here had expired), other computers, and more photos. One photo is not a benchmark.
- **Quality:** letters and furniture stay correct and edges are much cleaner. Stock weights also look smooth and slightly painted: floor grain and thin stems lose texture. This is the main reason to fine-tune.
- **Speed:** Natural would take about 18 minutes for 12 photos here. Most of that is wasted making a 4x image we shrink to 2x. **Next, test Real-ESRGAN x2plus**, which should be much faster, and blending some of the source's fine texture back in.
- **Bundle:** 129 MB for one platform with both models. Host per-platform builds on GitHub Releases, or download models on first use.

## Listing links (HAR and others)

A plain request to a HAR listing returns HTTP 403, and the built-in browser got a "Press & Hold to confirm you are a human" page. **We will not bypass or automate that check.** So the tool can't fetch a HAR link by itself.

What should work is using the user's own browser:
1. The user pastes a link. Claude opens it in Claude in Chrome, or asks the user to open it.
2. The user completes any human check themselves.
3. The tool reads the photo URLs from the page the user is viewing and saves the largest versions, with a fallback of a small extension or bookmarklet for people without Claude in Chrome.

Unknown until someone passes the check once: where HAR stores gallery photos, their real size, and whether those image files can be downloaded directly. Only build per-site readers for public pages, starting with HAR, and accept that they can break when sites change.

**Commercial caution:** this is the riskiest part of selling the tool. HAR-side terms read through a mirror limit photos to personal, non-commercial use, and HAR's MLS rules restrict altering and advertising other firms' listings. Before selling, get legal review and consider limiting link import to the user's own listings or asking them to confirm rights. Selling it as "paste any HAR link" looks worst. This is not legal advice.

## Carousel style reference

From the part of @brandonnava_realtor's Instagram grid visible without logging in: one strong photo with open sky or dark space, a large centered white serif title naming the place, a small subtitle below, and little else. Other posts are Reels with a short story hook. The tools behind them weren't visible, so Canva use is unconfirmed.

- **Main output:** upscaled photos cropped to 4:5, ready to drop into Canva.
- **Optional:** our own "editorial serif" template for cover and detail slides, using open-licence fonts. It takes the general approach only, not anyone's branding or layouts.
- **Title placement:** find the calm area of the photo, usually sky, and place the title there.

## How it installs

| Where | How | Status |
|---|---|---|
| Claude Code and the desktop app's Code tab | Claude Code plugin from our GitHub marketplace, later Anthropic's directory | Primary route |
| Claude Desktop chat | Double-click or drag in the same `.mcpb` file | [Documented one-click install](https://claude.com/docs/connectors/building/mcpb.md) |
| Cowork or claude.ai | Unknown whether a local GPU tool is usable there | Test later, don't promise |

The plugin holds three things:
1. **A local MCP server** packaged as a `.mcpb`. [Plugins can reference a bundle by path or URL](https://code.claude.com/docs/en/plugins-reference), so one build serves both routes.
2. **A skill** that teaches Claude the workflow: inspect, choose, upscale, check, render.
3. **Model files**, downloaded on first use to the plugin's data folder and checksum-verified, or included in the bundle if size allows.

Anthropic's directory [no longer accepts `.mcpb` submissions directly](https://claude.com/docs/connectors/building/mcpb.md), so the plugin is also the route to a listing. The plugin name can't start with `claude-`.

## Key design change: Node, not Python

[Anthropic strongly recommends Node for bundles](https://claude.com/docs/connectors/building/mcpb.md) because Claude Desktop includes it. The user-side tool is therefore TypeScript. Python is used only by us, for training.

| Part | Choice | Checked |
|---|---|---|
| Model inference | `onnxruntime-node` 1.31.1 (MIT) | I inspected the package: it has Windows x64 and ARM64, Apple Silicon Mac, and Linux x64 and ARM64 builds, with DirectML files for both Windows builds. **It has no Intel Mac build.** |
| Image processing | `sharp` 0.35.5 | npm lists Windows x64 and ARM64 and both Mac builds |
| MCP | Official TypeScript SDK | Documented |
| Slide rendering | `playwright-core` driving the user's installed Edge or Chrome. If neither exists, download a browser on first use | Not yet tested |

This corrects an earlier plan that relied on the NPU through Python. The NPU package I found is Python-only, so the NPU is off the table for now. **Snapdragon PCs use DirectML on the Adreno GPU, or CPU**, and both ran successfully on this PC.

### Acceleration by computer (to be measured)

| Computer | First choice | Fallback |
|---|---|---|
| Windows with NVIDIA, AMD or Intel graphics | DirectML | CPU |
| Windows on Snapdragon | DirectML on Adreno | CPU |
| Apple Silicon Mac | CoreML, if the Node build includes it (confirm) | CPU |
| Linux, Claude Code only | CUDA if practical | CPU |
| Intel Mac | Not supported at launch | None |

On first run, the tool times a small test and picks a speed tier automatically. Users can override this.

## Claude does the judging

The user's own Claude is the "AI brain", which removes most of the machine learning I'd otherwise have to ship.

| Job | Who does it |
|---|---|
| Choosing the best photos, ordering them, labelling rooms | Claude, looking at a contact sheet the tool generates |
| Captions and slide text | Claude, from the user's facts |
| Reviewing results | Claude and the user, from before-and-after crops |
| Duplicates, sharpness, exposure, JPEG damage, upscaling, fidelity checks, rendering | The tool, locally and deterministically |

This adds no per-photo fee for you or a separate bill for users, though it counts toward their Claude plan's usage. Keep contact sheets small to limit that. The previous plan's CLIP classifier and aesthetic model are removed from v1.

### MCP tools

Long jobs would risk request timeouts, so upscaling runs as a background job with status checks.

- `inspect_photos`: folder in; sizes, damage scores, duplicates and contact sheet out
- `start_upscale` and `get_job`: photos and quality mode in; output paths, fidelity results and progress out
- `compare`: before-and-after crops for review
- `enhance`: gentle tone and optional vertical straightening
- `build_carousel`: ordered photos, template, text and aspect ratio in; slides and PDF out
- `system_check`: reports hardware, active backend and models

Everything is also usable from a small command-line tool, which makes testing easier.

## Making photos beautiful

Upscalers can't recover detail that isn't in the source. Beauty comes from cleaning damage, plausible sharpness, good tone and good layout. Keep structure and text accurate.

Modes:
- **Natural (default):** faithful model, high fidelity threshold. Right for real estate.
- **Crisp:** higher-GAN-weight model with more apparent detail, for general photos. Fidelity warnings stay on.
- **Fast:** compact model for previews and slow computers.

Pipeline: read, measure damage, clean JPEG artifacts when needed, upscale in overlapping tiles with blended seams, fidelity check, downscale to target size, optional gentle tone and straightening, encode once.

Generative diffusion models stay out of v1. They need heavy hardware and large downloads, and they invent detail.

The fidelity gate works as before: downscale the result and compare against the source by worst tile, restore original low-frequency colour, and check for warped lines. Failed regions blend toward a plain resize and get flagged. Thresholds need calibrating, and invented texture can still pass, so review stays in the loop. Text checking needs a bundled OCR model, so it comes later.

## Models

Models must run in ONNX on ordinary hardware, and their licences must allow redistribution.

| Role | Starting model | Licence | Notes |
|---|---|---|---|
| Natural and Crisp | Fine-tuned RRDBNet from Real-ESRGAN x4plus | BSD-3; include its notice | Baseline is the unmodified model, exported to ONNX by us |
| Fast | Compact SRVGGNet from Real-ESRGAN General-x4v3 | Check its weight terms | About 10x lighter per Qualcomm's benchmarks |
| JPEG cleanup | Test first; FBCNN if helpful | Reported Apache-2.0; confirm in official repo | The fine-tuned model may make this unnecessary |

Not suitable for v1: HAT and DRCT (too slow without strong GPUs), and SUPIR, FLUX.1-dev and Jasper ControlNet (licence). Qualcomm's converted files aren't needed and their redistribution terms are unchecked.

### Custom training

Fine-tune rather than designing from scratch. Train on free Kaggle GPUs, [commonly reported at about 30 hours a week](https://gpuperhour.com/blog/free-cloud-gpus-and-credits) with no published fixed quota, using [traiNNer-redux](https://gh.hhj520.top/the-database/traiNNer-redux/wiki/%F0%9F%93%88-Training%E2%80%90a%E2%80%90Model%E2%80%90in%E2%80%90traiNNer%E2%80%90redux) or [neosr](https://github.com/androw03/neosr). Read Kaggle's terms first.

- **Data:** general photos with extra interiors and architecture, so it's good for real estate without being limited to it. Because we'll distribute the weights, record every dataset's licence and exclude restricted ones. Ordinary listing copies are too low-resolution to serve as training targets.
- **Damage model:** match web photos: downscaling, repeated JPEG compression, some noise and blur.
- **Ship rule:** a custom model replaces the baseline only if it wins on a held-out test set and in side-by-side viewing.

## Carousels

Output is 1080x1350 JPEG under 8 MB per Instagram's published API limits, plus a 1080x1440 option for manual posting and a LinkedIn PDF. Pans across two slides and stacked photos show whole rooms without generating pixels. Start with three to five polished templates and bundled open-licence fonts, including one real estate preset with a facts slide and attribution fields. Reels come later, since FFmpeg isn't guaranteed on users' machines and bundling it brings licensing checks.

## Milestones

| # | Deliverable | Done when |
|---|---|---|
| 0 | **Install proof** | Done so far: bundle upscales one photo over MCP on your PC. Remaining: install from GitHub into a real Claude session |
| 1 | Cross-platform CI | Automated bundle build and tests on Windows, Mac and Linux |
| 2 | Upscale tools and test set | Compare x2plus and texture blending. Folder in, upscaled folder out, seam-free and resumable, with low memory use on 8 GB machines |
| 2b | HAR link import | Inspect a real listing after a person passes the check, then read photos from the user's own browser |
| 3 | Fidelity gate and compare | Catches deliberately planted failures |
| 4 | Skill and inspection | Claude runs a whole batch from one plain-English request |
| 5 | Carousel renderer | Slides ready to post, including pans and stacks |
| 6 | Outside testers | Clean install on at least a Windows NVIDIA or Intel PC and an Apple Silicon Mac |
| 7 | Public release | Marketplace install, README, licences page, submitted to directory |
| 8 | Custom model | Fine-tuned model passes the ship rule and ships as an update |

Milestone 0 comes first because it can change the architecture. The product is usable with baseline models well before milestone 8.

## Risks

- **Node availability in Claude Code:** Claude Desktop includes Node, but a Claude Code user might not have it. Test this in milestone 0. If it's a problem, ship a self-contained binary, a [supported bundle type](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).
- **Bundle size:** the ONNX package is 115 MB compressed and 308 MB unpacked with all platforms included. Strip unneeded files, or build per-platform bundles if plugin routing allows.
- **Native files in bundles:** the manifest spec [gives little guidance on bundling native modules across platforms](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md). Windows SmartScreen and Mac Gatekeeper may also object to unsigned files. Signing would be a fixed cost, not a per-photo one. Test before assuming it's needed.
- **DirectML quality and stability:** some drivers or models may produce errors or artifacts. Include a health check that compares against a CPU result and falls back automatically.
- **Slow computers:** CPU-only upscaling could take minutes per photo. Use the Fast tier, upscale only selected photos, and show honest time estimates.
- **Mac testing:** I can't test a Mac from this PC. CI helps, but a real tester is still needed.
- **Fine-tuning may gain little:** the ship rule prevents a pointless swap.
- **Support and updates:** a public tool brings bug reports across many hardware setups. `system_check` output makes these answerable.
- **Legal:** local processing reduces your role as an operator, but users still need rights to their photos, and alteration disclosure rules still apply. Have the README state this, and get legal review before a public release. This is not legal advice.

## What I need from you

1. **Go-ahead to commit and push.** `gh` isn't installed here and git has no saved credential helper, so the first push may ask you to sign in.
2. **A public or private decision.** The repo answered without a login, so it appears to be public. All rights reserved limits legal reuse, but anyone can still read public code. Private suits selling, but makes plugin install harder for customers, so distribution needs a decision before release.
3. **One press-and-hold on a HAR listing,** so I can inspect how its photos are stored.
4. **Test photos:** 30 or more high-resolution originals you have rights to.
5. **Testers:** someone with a Mac and someone with a typical Windows PC, by milestone 6.
6. **A free Kaggle account** by milestone 8.
