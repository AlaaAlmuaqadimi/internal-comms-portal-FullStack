import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Employee presence tracker.
 *
 * The directory API already returns a `presence` field per employee, so the
 * server value is the seed for every list refresh. On top of that seed this
 * hook runs a light simulated heartbeat so the green/gray indicator behaves
 * like a live status feed while realtime presence is not wired end-to-end.
 *
 * Swap `simulate` off (or connect the interval to a websocket/polling call)
 * when a realtime presence channel becomes available; the rest of the UI only
 * consumes `isOnline(employee)` and the `presence` map.
 */
const DEFAULT_INTERVAL_MS = 30000;
const MAX_CHANGES_PER_TICK = 2;

const usePresence = (
  employees,
  { simulate = true, intervalMs = DEFAULT_INTERVAL_MS } = {}
) => {
  const [presence, setPresence] = useState({});
  const employeesRef = useRef([]);

  // Re-seed from the server whenever the directory query returns new rows.
  useEffect(() => {
    const list = Array.isArray(employees) ? employees : [];
    employeesRef.current = list;

    const next = {};
    for (const employee of list) {
      const active = employee.isActive !== false;
      // Server presence wins on every refetch; the heartbeat below only
      // animates between refreshes.
      next[employee.id] = active ? employee.presence === 'online' : false;
    }
    setPresence(next);
  }, [employees]);

  // Simulated heartbeat: flip the state of a couple of active employees so the
  // badge looks alive. Inactive employees are never marked online.
  useEffect(() => {
    if (!simulate) return undefined;

    const timer = setInterval(() => {
      const list = employeesRef.current;
      if (list.length === 0) return;

      setPresence((prev) => {
        const next = { ...prev };
        const changes =
          1 + Math.floor(Math.random() * MAX_CHANGES_PER_TICK);

        for (let i = 0; i < changes; i += 1) {
          const employee = list[Math.floor(Math.random() * list.length)];
          if (!employee || employee.isActive === false) continue;
          next[employee.id] = !next[employee.id];
        }

        return next;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [simulate, intervalMs]);

  const isOnline = useCallback(
    (employee) => {
      if (!employee) return false;
      if (employee.isActive === false) return false;
      return !!presence[employee.id];
    },
    [presence]
  );

  const onlineCount = useMemo(
    () => Object.values(presence).filter(Boolean).length,
    [presence]
  );

  return { presence, isOnline, onlineCount };
};

export default usePresence;
