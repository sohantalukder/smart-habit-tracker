import { useCallback, useEffect, useState } from 'react';
import type { Scalar } from '@op-engineering/op-sqlite';
import { currentDatabase, resultRows } from './database';

export function useReactiveQuery<T>(
  query: string,
  parameters: Scalar[],
  tables: string[]
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const result = await currentDatabase().execute(query, parameters);
    setData(resultRows<T>(result));
    setLoading(false);
  }, [parameters, query]);

  useEffect(() => {
    void refresh();
    return currentDatabase().reactiveExecute({
      query,
      arguments: parameters,
      fireOn: tables.map((table) => ({ table })),
      callback: (result) => {
        setData(resultRows<T>(result));
        setLoading(false);
      },
    });
  }, [parameters, query, refresh, tables]);

  return { data, loading, refresh };
}
