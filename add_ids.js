const fs = require('fs');
const data = JSON.parse(fs.readFileSync('src/data/campaignRewards.json'));
Object.keys(data.areas).forEach(area => {
  data.areas[area].rewards.forEach((r, i) => {
    r.id = area.replace(/\s+/g, '_') + '_' + i;
  });
});
fs.writeFileSync('src/data/campaignRewards.json', JSON.stringify(data, null, 2));
