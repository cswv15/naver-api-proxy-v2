// utils/calcDeviceRatio.js
export function calcDeviceRatio(pc, mobile) {
  const pcN = Number(pc || 0);
  const moN = Number(mobile || 0);
  const total = pcN + moN;
  if (!total) return { pc: 0, mobile: 0 };

  const pcPct = Math.round((pcN / total) * 1000) / 10;     // 소수 1자리
  const moPct = Math.round((moN / total) * 1000) / 10;
  return { pc: pcPct, mobile: moPct };
}
