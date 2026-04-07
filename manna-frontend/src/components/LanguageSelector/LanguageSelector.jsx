import React from 'react';
import { useTranslation } from 'react-i18next';
import './LanguageSelector.css';

const LanguageSelector = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="language-selector">
      <button 
        onClick={() => changeLanguage('es')}
        className={`lang-btn ${i18n.language === 'es' ? 'active' : ''}`}
      >
        🇪🇸 ES
      </button>
      <button 
        onClick={() => changeLanguage('en')}
        className={`lang-btn ${i18n.language === 'en' ? 'active' : ''}`}
      >
        🇺🇸 EN
      </button>
    </div>
  );
};

export default LanguageSelector;
