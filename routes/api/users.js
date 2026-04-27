const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { requireAdminApi, getAllUsers, empNoExists, createUser, findUser, updateUser, deleteUserByEmpNo } = require('../../lib/functions');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAdminApi);

// GET - 목록
router.get('/', async function(req, res) {
  try {
    var users = await getAllUsers();
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: 'DB 오류가 발생했습니다.' });
  }
});

// POST - 추가
router.post('/', async function(req, res) {
  var name     = (req.body.name     || '').trim();
  var empNo    = (req.body.empNo    || '').trim();
  var phone    = (req.body.phone    || '').trim();
  var deptName = (req.body.deptName || '').trim() || null;
  var position = (req.body.position || '').trim() || null;
  var costType = (req.body.costType || '운영').trim();

  if (!name || !empNo || !phone) {
    return res.status(400).json({ error: '이름, 사번, 연락처는 필수입니다.' });
  }
  try {
    if (await empNoExists(empNo)) {
      return res.status(409).json({ error: '이미 존재하는 사번입니다.' });
    }
    await createUser(name, empNo, phone, 'user', empNo, true, deptName, position, costType);
    res.json({ success: true, message: name + ' 사용자가 추가되었습니다. (초기 비밀번호: 사번)' });
  } catch (e) {
    res.status(500).json({ error: '사용자 추가에 실패했습니다.' });
  }
});

// PUT - 수정
router.put('/', async function(req, res) {
  var empNo    = (req.body.empNo    || '').trim();
  var name     = (req.body.name     || '').trim();
  var phone    = (req.body.phone    || '').trim();
  var role     = (req.body.role     || '').trim();
  var deptName = req.body.deptName !== undefined ? (req.body.deptName || '').trim() : undefined;
  var position = req.body.position !== undefined ? (req.body.position || '').trim() : undefined;
  var costType = (req.body.costType || '').trim() || undefined;

  if (!empNo) return res.status(400).json({ error: '사번이 필요합니다.' });
  try {
    if (!await findUser(empNo)) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    await updateUser(empNo, name, phone, role, deptName, position, costType);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

// DELETE - 삭제
router.delete('/', async function(req, res) {
  var empNo = (req.body.empNo || '').trim();

  if (!empNo) return res.status(400).json({ error: '사번이 필요합니다.' });
  if (empNo === '0000') return res.status(400).json({ error: '관리자 계정은 삭제할 수 없습니다.' });
  try {
    if (!await findUser(empNo)) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    await deleteUserByEmpNo(empNo);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

// GET /template - 엑셀 양식 다운로드
router.get('/template', function(req, res) {
  var wb = XLSX.utils.book_new();
  var data = [
    ['이름', '사번', '연락처', '부서', '직급', '비용구분'],
    ['홍길동', 'P00001', '010-1234-5678', '운영1팀', '대리', '운영'],
  ];
  var ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, '사용자목록');
  var buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="user_upload_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// POST /bulk - 엑셀 일괄 업로드
router.post('/bulk', upload.single('file'), async function(req, res) {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

  var wb;
  try {
    wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  } catch (e) {
    return res.status(400).json({ error: '엑셀 파일을 읽을 수 없습니다.' });
  }

  var ws = wb.Sheets[wb.SheetNames[0]];
  var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (!rows.length) return res.status(400).json({ error: '데이터가 없습니다.' });

  var results = { success: 0, failed: [] };
  var validCostTypes = ['운영', '판관', '자동차', '운송'];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var name     = String(row['이름']    || row['name']     || '').trim();
    var empNo    = String(row['사번']    || row['empNo']    || '').trim();
    var phone    = String(row['연락처']  || row['phone']    || '').trim();
    var deptName = String(row['부서']    || row['deptName'] || '').trim() || null;
    var position = String(row['직급']    || row['position'] || '').trim() || null;
    var costType = String(row['비용구분'] || row['costType'] || '').trim() || '운영';

    if (!validCostTypes.includes(costType)) costType = '운영';

    if (!name || !empNo || !phone) {
      results.failed.push({ row: i + 2, empNo: empNo || '-', name: name || '-', reason: '이름, 사번, 연락처는 필수입니다.' });
      continue;
    }
    try {
      if (await empNoExists(empNo)) {
        results.failed.push({ row: i + 2, empNo, name, reason: '이미 존재하는 사번입니다.' });
        continue;
      }
      await createUser(name, empNo, phone, 'user', empNo, true, deptName, position, costType);
      results.success++;
    } catch (e) {
      results.failed.push({ row: i + 2, empNo, name, reason: 'DB 오류' });
    }
  }

  res.json(results);
});

module.exports = router;
