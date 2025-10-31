export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const pc = parseFloat(req.query.pc || req.body?.pc || 0);
  const mobile = parseFloat(req.query.mobile || req.body?.mobile || 0);
  
  const total = pc + mobile;
  
  const pcRatio = total > 0 ? parseFloat((pc / total * 100).toFixed(1)) : 0;
  const mobileRatio = total > 0 ? parseFloat((mobile / total * 100).toFixed(1)) : 0;
  
  return res.status(200).json({
    pcRatio,
    mobileRatio
  });
}