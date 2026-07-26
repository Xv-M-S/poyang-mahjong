const HONORS = ["东", "南", "西", "北", "中", "发", "白"];
const UNITS = ["万", "筒", "条"];

function tileView(tile) {
  const kind = tile.kind;
  const suited = kind < 27;
  const suitIndex = suited ? Math.floor(kind / 9) : 3;
  const rank = suited ? kind % 9 + 1 : kind - 27;
  return Object.assign({}, tile, {
    rank,
    symbol: suited ? String(rank) : HONORS[rank],
    unit: suited ? UNITS[suitIndex] : "",
    suitClass: suited ? ["wan", "tong", "tiao"][suitIndex] : "honor",
    imagePath: "/assets/tiles/tile-" + kind + ".png"
  });
}
module.exports = { tileView };
