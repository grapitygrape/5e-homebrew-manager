import { json } from '@sveltejs/kit';
import { apiHandler, boolQueryParam, notFound } from '$lib/server/http';
import { getDataSource } from '$lib/services/datasource';
import { validateDocument } from '$lib/services/validate-service';
import { errorText } from '$lib/util';

export const POST = apiHandler(async ({ params, url }) => {
  const file = params.file ?? '';
  let data: Record<string, unknown>;
  try {
    data = await getDataSource().readHomebrew(file);
  } catch (e) {
    throw notFound(errorText(e));
  }
  const result = await validateDocument(data);
  if (boolQueryParam(url, 'detail')) {
    return json({
      file,
      totals: result.totals,
      types: result.types,
      issues: result.issues,
    });
  }
  return json({ file, totals: result.totals, types: result.types });
});
