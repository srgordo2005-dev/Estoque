const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const target = `function TestePage({ctx}){
  const{data,mutate,user,webhookUrl,allModels,gTH,gChips,setModal}=ctx;const models=allModels();`;

const replacement = `function TestePage({ctx}){
  const{data,mutate,user,webhookUrl,allModels,gTH,gChips,setModal}=ctx;const models=allModels();
  const [toastMsg, setToastMsg] = useState("");
  const triggerToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3500);
  }, []);`;

code = code.replace(target, replacement);
fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("REPLACED TESTE PAGE TRIGGERTOAST!");
