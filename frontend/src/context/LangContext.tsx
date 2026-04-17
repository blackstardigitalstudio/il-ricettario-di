import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t, getDeviceLanguage, LangCode, LANGUAGES } from '../i18n/translations';

type LangContextType = {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  T: (key: string) => string;
};

const LangContext = createContext<LangContextType>({
  lang: 'it',
  setLang: () => {},
  T: (key: string) => key,
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>('it');

  useEffect(() => {
    const load = async () => {
      try {
        const saved = await AsyncStorage.getItem('app_language');
        if (saved && LANGUAGES.find(l => l.code === saved)) {
          setLangState(saved as LangCode);
        } else {
          setLangState(getDeviceLanguage());
        }
      } catch (e) { /* */ }
    };
    load();
  }, []);

  const setLang = async (l: LangCode) => {
    setLangState(l);
    await AsyncStorage.setItem('app_language', l);
  };

  const T = (key: string) => t(key, lang);

  return (
    <LangContext.Provider value={{ lang, setLang, T }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

export { LANGUAGES, LangCode };
