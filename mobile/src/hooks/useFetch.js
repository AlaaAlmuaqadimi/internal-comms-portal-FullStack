import { translate } from '../context/LanguageContext';
import { useState, useEffect, useCallback } from 'react';

const useFetch = (fetchFunction, immediate = true) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  const execute = useCallback(async (...params) => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchFunction(...params);
      setData(result);
      return result;
    } catch (err) {
      setError(err.message || translate('mock.errorUnexpected'));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchFunction]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  const refetch = useCallback(() => {
    return execute();
  }, [execute]);

  return { data, loading, error, execute, refetch, setData };
};

export default useFetch;
