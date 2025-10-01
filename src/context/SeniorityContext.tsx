import React, { createContext, useContext, useState, ReactNode } from "react";

interface SeniorityContextType {
  fullYears: number;
  setFullYears: (years: number) => void;
}

const SeniorityContext = createContext<SeniorityContextType | undefined>(
  undefined,
);

export const SeniorityProvider = ({ children }: { children: ReactNode }) => {
  const [fullYears, setFullYears] = useState<number>(0);

  return (
    <SeniorityContext.Provider value={{ fullYears, setFullYears }}>
      {children}
    </SeniorityContext.Provider>
  );
};

export const useSeniority = () => {
  const context = useContext(SeniorityContext);
  if (!context) {
    throw new Error("useSeniority must be used within a SeniorityProvider");
  }
  return context;
};
