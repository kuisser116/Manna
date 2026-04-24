import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Traducciones básicas para empezar
const resources = {
  es: {
    translation: {
      "common": {
        "loading": "Cargando...",
        "error": "Error",
        "success": "Éxito",
        "cancel": "Cancelar",
        "save": "Guardar",
        "delete": "Eliminar",
        "edit": "Editar",
        "close": "Cerrar",
        "submit": "Enviar",
        "search": "Buscar",
        "filter": "Filtrar",
        "sort": "Ordenar"
      },
      "topbar": {
        "search": "Buscar en Aseria",
        "myQR": "Mi QR"
      },
      "sidebar": {
        "feed": "Inicio",
        "create": "Publicar",
        "qr": "QR",
        "studio": "Estudio",
        "profile": "Perfil"
      },
      "feed": {
        "noPostsYet": "Nadie ha publicado nada todavía. ¿Y si empiezas tú?",
        "createPost": "Publicar algo",
        "endOfFeed": "¡Has llegado al final!"
      },
      "wallet": {
        "balance": "Saldo",
        "coupons": "Cupones",
        "personalBalance": "TU BALANCE PERSONAL",
        "yourWallet": "Tu Billetera Aseria",
        "withdrawOxxo": "Retirar en Oxxo / MoneyGram"
      },
      "profile": {
        "editProfile": "Editar Perfil",
        "follow": "Seguir",
        "following": "Siguiendo",
        "posts": "Publicaciones",
        "followers": "Seguidores",
        "likes": "Me gusta",
        "saved": "Guardados",
        "noPosts": "Aún no hay publicaciones en este remanso.",
        "noLikes": "Aún no has dado me gusta a ninguna publicación.",
        "noSaved": "Aún no tienes publicaciones guardadas."
      },
      "notifications": {
        "title": "Notificaciones",
        "noNotifications": "No tienes notificaciones nuevas",
        "markAllRead": "Marcar todas como leídas",
        "followedYou": "empezó a seguirte",
        "likedPost": "le gustó tu publicación",
        "commentedPost": "comentó tu publicación",
        "supportedPost": "apoyó tu publicación",
        "savedPost": "guardó tu publicación",
        "mentionedYou": "te mencionó",
        "newPost": "publicó algo nuevo",
        "hoursAgo": "hace {{count}} horas",
        "minutesAgo": "hace {{count}} minutos",
        "secondsAgo": "hace {{count}} segundos",
        "justNow": "ahora mismo",
        "loadMore": "Cargar más"
      }
    }
  },
  en: {
    translation: {
      "common": {
        "loading": "Loading...",
        "error": "Error",
        "success": "Success",
        "cancel": "Cancel",
        "save": "Save",
        "delete": "Delete",
        "edit": "Edit",
        "close": "Close",
        "submit": "Submit",
        "search": "Search",
        "filter": "Filter",
        "sort": "Sort"
      },
      "topbar": {
        "search": "Search in Aseria",
        "myQR": "My QR"
      },
      "sidebar": {
        "feed": "Feed",
        "create": "Create",
        "qr": "QR",
        "studio": "Studio",
        "profile": "Profile"
      },
      "feed": {
        "noPostsYet": "Nobody has posted anything yet. Why don't you start?",
        "createPost": "Post something",
        "endOfFeed": "You've reached the end!"
      },
      "wallet": {
        "balance": "Balance",
        "coupons": "Coupons",
        "personalBalance": "YOUR PERSONAL BALANCE",
        "yourWallet": "Your Aseria Wallet",
        "withdrawOxxo": "Withdraw at Oxxo / MoneyGram"
      },
      "profile": {
        "editProfile": "Edit Profile",
        "follow": "Follow",
        "following": "Following",
        "posts": "Posts",
        "followers": "Followers",
        "likes": "Likes",
        "saved": "Saved",
        "noPosts": "There are no posts in this space yet.",
        "noLikes": "You haven't liked any posts yet.",
        "noSaved": "You don't have any saved posts yet."
      },
      "notifications": {
        "title": "Notifications",
        "noNotifications": "You have no new notifications",
        "markAllRead": "Mark all as read",
        "followedYou": "started following you",
        "likedPost": "liked your post",
        "commentedPost": "commented on your post",
        "supportedPost": "supported your post",
        "savedPost": "saved your post",
        "mentionedYou": "mentioned you",
        "newPost": "posted something new",
        "hoursAgo": "{{count}} hours ago",
        "minutesAgo": "{{count}} minutes ago",
        "secondsAgo": "{{count}} seconds ago",
        "justNow": "just now",
        "loadMore": "Load more"
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'es',
    debug: false,
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

export default i18n;
