// Paginas legales de Alldesign Karl: solo estilos y datos de contacto.
import './quote.css';
import { applyContact } from './contact';

applyContact();
document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())));
