const fs = require('fs');

let appCode = fs.readFileSync('src/App.jsx', 'utf8');

const search = `const[webhookUrl,setWebhookUrl]=useState(()=>localStorage.getItem("webhookUrl")||DEFAULT_WEBHOOK_URL);`;
const replace = `const[webhookUrl,setWebhookUrl]=useState(()=>localStorage.getItem("webhookUrl")||DEFAULT_WEBHOOK_URL);
  const [farmsConfig, setFarmsConfig] = usePersistedField("hs_farmsConfig", []);`;

if (appCode.includes(search)) {
    appCode = appCode.replace(search, replace);
    fs.writeFileSync('src/App.jsx', appCode);
    console.log("Injected farmsConfig into App.jsx");
} else {
    console.log("Could not find injection point.");
}
