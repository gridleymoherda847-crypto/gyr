-- ============================================
-- Supabase 重复数据检查 SQL 查询
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. 检查重复的兑换码（code字段）
-- 如果 code 字段有唯一约束，这个查询应该返回空
SELECT 
  code, 
  COUNT(*) as count,
  array_agg(id ORDER BY id) as ids,
  array_agg(created_at ORDER BY created_at) as created_dates
FROM redemption_codes
GROUP BY code
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- 2. 检查重复的设备指纹（device_fingerprint字段）
-- 查看是否有多个兑换码绑定到同一个设备
SELECT 
  device_fingerprint, 
  COUNT(*) as count,
  array_agg(code ORDER BY activated_at) as codes,
  array_agg(activated_at ORDER BY activated_at) as activated_dates
FROM redemption_codes
WHERE device_fingerprint IS NOT NULL
GROUP BY device_fingerprint
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- 3. 检查是否有重复的兑换码和设备指纹组合
-- 理论上每个兑换码只能绑定一个设备，这个查询应该返回空
SELECT 
  code,
  device_fingerprint,
  COUNT(*) as count,
  array_agg(id ORDER BY id) as ids
FROM redemption_codes
WHERE device_fingerprint IS NOT NULL
GROUP BY code, device_fingerprint
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- 4. 统计信息：查看总记录数、已使用数、未使用数
SELECT 
  COUNT(*) as total_codes,
  COUNT(*) FILTER (WHERE is_used = true) as used_codes,
  COUNT(*) FILTER (WHERE is_used = false) as unused_codes,
  COUNT(DISTINCT device_fingerprint) FILTER (WHERE device_fingerprint IS NOT NULL) as unique_devices
FROM redemption_codes;

-- 5. 查看所有已使用的兑换码及其设备信息
SELECT 
  code,
  device_fingerprint,
  is_used,
  activated_at,
  created_at
FROM redemption_codes
WHERE is_used = true
ORDER BY activated_at DESC;

-- 6. 查找可能的异常数据：
--    - 已使用但没有设备指纹的记录
SELECT 
  id,
  code,
  device_fingerprint,
  is_used,
  activated_at
FROM redemption_codes
WHERE is_used = true AND device_fingerprint IS NULL;

--    - 有设备指纹但标记为未使用的记录
SELECT 
  id,
  code,
  device_fingerprint,
  is_used,
  activated_at
FROM redemption_codes
WHERE is_used = false AND device_fingerprint IS NOT NULL;

-- 7. 删除重复的兑换码（谨慎使用！）
-- 保留最早创建的记录，删除其他重复项
-- ⚠️ 执行前请先备份数据！
/*
DELETE FROM redemption_codes
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY code ORDER BY created_at ASC) as rn
    FROM redemption_codes
  ) t
  WHERE t.rn > 1
);
*/

-- 8. 检查是否有空值或异常值
SELECT 
  COUNT(*) FILTER (WHERE code IS NULL OR code = '') as null_or_empty_codes,
  COUNT(*) FILTER (WHERE code IS NOT NULL AND LENGTH(code) < 10) as short_codes,
  COUNT(*) FILTER (WHERE created_at IS NULL) as null_created_at
FROM redemption_codes;
