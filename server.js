const express = require('express');
const path = require('path');
const app = express();
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
app.use(express.static(__dirname, { extensions: ['html'] }));
app.get('/health', (req,res)=>res.json({ok:true,service:'almodawana'}));
app.use((req,res,next)=>{ if(req.path.startsWith('/api/')) return res.status(404).json({ok:false,error:'هذا الإصدار يستخدم Gmail وGoogle Drive عبر Google OAuth من الواجهة.'}); res.sendFile(path.join(__dirname,'index.html')); });
if (require.main === module) { app.listen(PORT,HOST,()=>console.log(`برنامج المدونة يعمل على http://${HOST}:${PORT}`)); }
module.exports = app;
