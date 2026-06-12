export const API = import.meta.env.VITE_API_URL || ''; 
export const mediaUrl = (url) => {
  if (!url) return '/logo-epmi-gaming.png';
  if (typeof url === 'object') url = url.url || url.path || '';
  if (!url) return '/logo-epmi-gaming.png';
  return String(url).startsWith('/uploads') ? `${API}${url}` : String(url);
};
export const token = () => localStorage.getItem('epmi_token');
export async function request(path, options={}){
  const headers = { ...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}), ...(token()?{Authorization:`Bearer ${token()}`}:{}) };
  const res = await fetch(`${API}${path}`, { ...options, headers:{...headers, ...(options.headers||{})} });
  if(!res.ok) throw new Error((await res.json().catch(()=>({message:'Erreur'}))).message || 'Erreur API');
  return res.json();
}
export const uploadImage = async(file)=>{ const fd=new FormData(); fd.append('image',file); const data = await request('/api/upload',{method:'POST', body:fd}); return data.url; };
