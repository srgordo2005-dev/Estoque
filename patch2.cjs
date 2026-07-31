const fs = require('fs');
let content = fs.readFileSync('src/App.jsx', 'utf8');

// Replace MacPage header with sticky-header
content = content.replace(
  /<div style=\{\{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14\}\}>/g,
  '<div className="sticky-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14, padding: "10px 0"}}>'
);

// Replace the secondary search bar container to sticky as well (if needed, but sticking the top one is better)

fs.writeFileSync('src/App.jsx', content);
console.log('Sticky header added');
