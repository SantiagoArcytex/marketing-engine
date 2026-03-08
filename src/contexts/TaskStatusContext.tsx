import { createContext, useCallback, useContext, useRef, useState } from "react";

export type TaskStatus = "idle" | "running" | "success";

type TaskStatusState = Record<string, TaskStatus>;

type TaskStatusContextValue = {
  taskStatus: TaskStatusState;
  setTaskStatus: (moduleId: string, status: TaskStatus) => void;
};

const TaskStatusContext = createContext<TaskStatusContextValue | null>(null);

const SUCCESS_RESET_MS = 2500;

export function TaskStatusProvider({ children }: { children: React.ReactNode }) {
  const [taskStatus, setTaskStatusState] = useState<TaskStatusState>({});
  const successTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const setTaskStatus = useCallback((moduleId: string, status: TaskStatus) => {
    const existing = successTimeoutsRef.current[moduleId];
    if (existing) {
      clearTimeout(existing);
      delete successTimeoutsRef.current[moduleId];
    }
    setTaskStatusState((prev) => ({ ...prev, [moduleId]: status }));
    if (status === "success") {
      successTimeoutsRef.current[moduleId] = setTimeout(() => {
        delete successTimeoutsRef.current[moduleId];
        setTaskStatusState((p) => {
          const next = { ...p };
          if (next[moduleId] === "success") next[moduleId] = "idle";
          return next;
        });
      }, SUCCESS_RESET_MS);
    }
  }, []);

  return (
    <TaskStatusContext.Provider value={{ taskStatus, setTaskStatus }}>
      {children}
    </TaskStatusContext.Provider>
  );
}

export function useTaskStatus() {
  const ctx = useContext(TaskStatusContext);
  if (!ctx) throw new Error("useTaskStatus must be used within TaskStatusProvider");
  return ctx;
}
