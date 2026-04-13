# Mute Similar X Images

A Chrome extension for muting tweet images and hiding future posts with similar images.

## Features

- Right-click any tweet image on X
- Save muted images locally
- Scan new tweet images as you browse
- Hide posts that match your muted images
- Adjust the similarity threshold in settings

## Build

```bash
npm install
npm run build
```

The unpacked extension will be in `.output/chrome-mv3`.

## Load the extension

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select `.output/chrome-mv3`

## Setup

1. Open the extension options page
2. Add your Gemini API key
3. Open X
4. Right-click a tweet image
5. Choose `Mute similar images`

## Development

```bash
npm run dev
npm run compile
npm test
npm run zip
```

## Support

[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-ff5f5f?logo=ko-fi&logoColor=white)](https://ko-fi.com/aymanhassan)
