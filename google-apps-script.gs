const SPREADSHEET_ID = '1NQlm9rlbQ_iBFDN7zVjiQnQgEVA7hxMyh46aCwDsWvg';
const SHEET_ID = 829409008;
const VALID_RISKS = ['Alta', 'Media', 'Baja'];
const MAX_DESCRIPTION_LENGTH = 1000;

function doPost(e) {
  const params = e && e.parameter ? e.parameter : {};
  const descripcion = String(params.descripcion || '').trim();
  const riesgo = String(params.riesgo || '').trim();
  const requestId = String(params.requestId || '').trim();

  if (!descripcion || descripcion.length > MAX_DESCRIPTION_LENGTH) {
    return createResponse(requestId, false, 'La descripción es obligatoria y debe tener hasta 1000 caracteres.');
  }

  if (!VALID_RISKS.includes(riesgo)) {
    return createResponse(requestId, false, 'El nivel de riesgo no es válido.');
  }

  if (!/^[a-f0-9]{32}$/.test(requestId)) {
    return createResponse(requestId, false, 'El identificador de solicitud no es válido.');
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetById(SHEET_ID);
    if (!sheet) {
      throw new Error(`No se encontró la pestaña con ID ${SHEET_ID}.`);
    }

    const cache = CacheService.getScriptCache();
    const cacheKey = `finding-${requestId}`;
    const cachedRow = Number(cache.get(cacheKey));
    if (Number.isInteger(cachedRow) && cachedRow > 0) {
      const previousValues = sheet.getRange(cachedRow, 1, 1, 3).getValues()[0];
      if (previousValues[0] instanceof Date &&
          previousValues[1] === descripcion &&
          previousValues[2] === riesgo) {
        return createResponse(requestId, true, 'Registro guardado y verificado.');
      }
      cache.remove(cacheKey);
    }

    const row = sheet.getLastRow() + 1;
    const timestamp = new Date();
    sheet.getRange(row, 1).setValue(timestamp);
    sheet.getRange(row, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sheet.getRange(row, 2, 1, 2).setNumberFormat('@');
    sheet.getRange(row, 2, 1, 2).setValues([[descripcion, riesgo]]);
    SpreadsheetApp.flush();

    const savedValues = sheet.getRange(row, 1, 1, 3).getValues()[0];
    if (!(savedValues[0] instanceof Date) ||
        savedValues[1] !== descripcion ||
        savedValues[2] !== riesgo) {
      throw new Error(`No se pudo verificar el registro guardado en la fila ${row}.`);
    }

    try {
      cache.put(cacheKey, String(row), 21600);
    } catch (cacheError) {
      console.error('No se pudo guardar la clave temporal de idempotencia:', cacheError);
    }

    return createResponse(requestId, true, 'Registro guardado y verificado.');
  } catch (error) {
    console.error('Error al guardar el hallazgo:', error);
    return createResponse(requestId, false, 'No se pudo guardar el hallazgo en Google Sheets.');
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function createResponse(requestId, success, message) {
  const payload = JSON.stringify({
    type: 'finding-save-result',
    requestId: requestId,
    success: success,
    message: message
  }).replace(/</g, '\\u003c');

  const html = '<!doctype html><html><body><script>' +
    'window.parent.postMessage(' + payload + ', "*");' +
    '</script></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
