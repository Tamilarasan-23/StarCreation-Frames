# Star Creation AR Frames — V2

## Important: two separate images

### Home page image
`assets/home-preview.jpg`

This image is ONLY for the website's visual/home-page design. Replace it with any image you want to show on the landing page.

### Target recognition image
`assets/target-poster.jpg`

This image is the ONLY image used by the scanner for recognition.

The target image does NOT need to be displayed on the home page.

### Video
`videos/ar-video.mp4`

This is the video that plays after `target-poster.jpg` is recognized.

## Flow

Home page image
→ user taps SCAN FRAME
→ camera permission
→ scanner opens
→ camera recognizes `target-poster.jpg`
→ camera closes
→ `ar-video.mp4` plays fullscreen

## GitHub structure

star-creation-ar-frames/
├── index.html
├── style.css
├── app.js
├── assets/
│   ├── home-preview.jpg
│   ├── target-poster.jpg
│   └── logo.png
└── videos/
    └── ar-video.mp4

For your real test, replace:
- `home-preview.jpg` with your website/hero image
- `target-poster.jpg` with the exact poster that will be printed
- `ar-video.mp4` with the video linked to that poster

Do not rename the target file unless you also change `app.js`.
