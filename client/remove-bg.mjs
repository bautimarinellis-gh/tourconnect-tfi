import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'fs';

const imgPath = './public/logo.png';

async function removeWhiteBackground() {
  const img = await loadImage(readFileSync(imgPath));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Pure white -> fully transparent
    if (r > 240 && g > 240 && b > 240) {
      data[i + 3] = 0;
    } else if (r > 200 && g > 200 && b > 200) {
      // Near-white -> semi-transparent
      const brightness = (r + g + b) / 3;
      data[i + 3] = Math.max(0, 255 - brightness);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const pngBuffer = canvas.toBuffer('image/png');
  writeFileSync('./public/logo.png', pngBuffer);
  console.log('Done! Background removed.');
}

removeWhiteBackground().catch(console.error);
