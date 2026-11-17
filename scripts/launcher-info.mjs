const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT in .env');
console.log(JSON.stringify({port,url:'http://127.0.0.1:'+port}));
