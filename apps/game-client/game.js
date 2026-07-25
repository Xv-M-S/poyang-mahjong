const canvas = wx.createCanvas();
const context = canvas.getContext("2d");
const windowInfo = wx.getWindowInfo();

canvas.width = windowInfo.windowWidth;
canvas.height = windowInfo.windowHeight;

function drawRoundedRect(x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function renderLaunchScreen() {
  const width = canvas.width;
  const height = canvas.height;
  const cardWidth = Math.min(width * 0.72, 620);
  const cardHeight = Math.min(height * 0.58, 300);
  const cardX = (width - cardWidth) / 2;
  const cardY = (height - cardHeight) / 2;

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#0d4d3a");
  background.addColorStop(1, "#082c25");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(255, 255, 255, 0.08)";
  drawRoundedRect(cardX, cardY, cardWidth, cardHeight, 24);
  context.fill();

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#f6d788";
  context.font = `bold ${Math.max(30, Math.min(52, width * 0.07))}px sans-serif`;
  context.fillText("鄱阳麻将", width / 2, height / 2 - 38);

  context.fillStyle = "rgba(255, 255, 255, 0.8)";
  context.font = `${Math.max(15, Math.min(22, width * 0.03))}px sans-serif`;
  context.fillText("微信小游戏客户端已启动", width / 2, height / 2 + 34);
}

renderLaunchScreen();
