interface EmailStrings {
  subject: string;
  heading: string;
  body: string;
  buttonText: string;
  footer: string;
}

type ActionType = "signup" | "recovery" | "email_change";

const t: Record<string, Record<ActionType, EmailStrings>> = {
  en: {
    signup: {
      subject: "Confirm your TypeWord account",
      heading: "Welcome to TypeWord!",
      body: "Thank you for signing up. Please confirm your email address by clicking the button below.",
      buttonText: "Confirm Email",
      footer: "If you didn't create a TypeWord account, you can safely ignore this email.",
    },
    recovery: {
      subject: "Reset your TypeWord password",
      heading: "Password Reset",
      body: "We received a request to reset your password. Click the button below to choose a new password.",
      buttonText: "Reset Password",
      footer: "If you didn't request a password reset, you can safely ignore this email.",
    },
    email_change: {
      subject: "Confirm your new email address",
      heading: "Email Change",
      body: "Please confirm your new email address by clicking the button below.",
      buttonText: "Confirm New Email",
      footer: "If you didn't request this change, please contact support.",
    },
  },
  ko: {
    signup: {
      subject: "TypeWord 이메일 인증",
      heading: "TypeWord에 오신 것을 환영합니다!",
      body: "회원가입해 주셔서 감사합니다. 아래 버튼을 클릭하여 이메일 주소를 인증해주세요.",
      buttonText: "이메일 인증",
      footer: "TypeWord 계정을 만들지 않으셨다면 이 이메일을 무시해주세요.",
    },
    recovery: {
      subject: "TypeWord 비밀번호 재설정",
      heading: "비밀번호 재설정",
      body: "비밀번호 재설정 요청을 받았습니다. 아래 버튼을 클릭하여 새 비밀번호를 설정해주세요.",
      buttonText: "비밀번호 재설정",
      footer: "비밀번호 재설정을 요청하지 않으셨다면 이 이메일을 무시해주세요.",
    },
    email_change: {
      subject: "TypeWord 이메일 변경 인증",
      heading: "이메일 변경",
      body: "아래 버튼을 클릭하여 새 이메일 주소를 인증해주세요.",
      buttonText: "이메일 인증",
      footer: "이메일 변경을 요청하지 않으셨다면 고객지원으로 연락해주세요.",
    },
  },
  ja: {
    signup: {
      subject: "TypeWord アカウントの確認",
      heading: "TypeWord へようこそ！",
      body: "ご登録ありがとうございます。下のボタンをクリックしてメールアドレスを確認してください。",
      buttonText: "メール確認",
      footer: "TypeWord アカウントを作成していない場合、このメールは無視してください。",
    },
    recovery: {
      subject: "TypeWord パスワードのリセット",
      heading: "パスワードリセット",
      body: "パスワードリセットのリクエストを受け付けました。下のボタンをクリックして新しいパスワードを設定してください。",
      buttonText: "パスワードリセット",
      footer: "リクエストしていない場合、このメールは無視してください。",
    },
    email_change: {
      subject: "TypeWord メールアドレスの変更確認",
      heading: "メールアドレスの変更",
      body: "下のボタンをクリックして新しいメールアドレスを確認してください。",
      buttonText: "メール確認",
      footer: "変更をリクエストしていない場合、サポートにご連絡ください。",
    },
  },
  zh: {
    signup: {
      subject: "确认您的 TypeWord 账户",
      heading: "欢迎使用 TypeWord！",
      body: "感谢您注册。请点击下方按钮确认您的电子邮箱地址。",
      buttonText: "确认邮箱",
      footer: "如果您没有创建 TypeWord 账户，请忽略此邮件。",
    },
    recovery: {
      subject: "重置您的 TypeWord 密码",
      heading: "密码重置",
      body: "我们收到了重置密码的请求。请点击下方按钮设置新密码。",
      buttonText: "重置密码",
      footer: "如果您没有请求重置密码，请忽略此邮件。",
    },
    email_change: {
      subject: "确认您的新邮箱地址",
      heading: "邮箱变更",
      body: "请点击下方按钮确认您的新邮箱地址。",
      buttonText: "确认邮箱",
      footer: "如果您没有请求此更改，请联系客服。",
    },
  },
  es: {
    signup: {
      subject: "Confirma tu cuenta de TypeWord",
      heading: "¡Bienvenido a TypeWord!",
      body: "Gracias por registrarte. Haz clic en el botón para confirmar tu dirección de correo.",
      buttonText: "Confirmar correo",
      footer: "Si no creaste una cuenta en TypeWord, puedes ignorar este correo.",
    },
    recovery: {
      subject: "Restablecer tu contraseña de TypeWord",
      heading: "Restablecer contraseña",
      body: "Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para elegir una nueva.",
      buttonText: "Restablecer contraseña",
      footer: "Si no solicitaste esto, puedes ignorar este correo.",
    },
    email_change: {
      subject: "Confirmar nueva dirección de correo",
      heading: "Cambio de correo",
      body: "Haz clic en el botón para confirmar tu nueva dirección de correo.",
      buttonText: "Confirmar correo",
      footer: "Si no solicitaste este cambio, contacta con soporte.",
    },
  },
  fr: {
    signup: {
      subject: "Confirmez votre compte TypeWord",
      heading: "Bienvenue sur TypeWord !",
      body: "Merci de vous être inscrit. Cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail.",
      buttonText: "Confirmer l'e-mail",
      footer: "Si vous n'avez pas créé de compte TypeWord, ignorez cet e-mail.",
    },
    recovery: {
      subject: "Réinitialiser votre mot de passe TypeWord",
      heading: "Réinitialisation du mot de passe",
      body: "Nous avons reçu une demande de réinitialisation de mot de passe. Cliquez ci-dessous pour en choisir un nouveau.",
      buttonText: "Réinitialiser",
      footer: "Si vous n'avez pas fait cette demande, ignorez cet e-mail.",
    },
    email_change: {
      subject: "Confirmer votre nouvelle adresse e-mail",
      heading: "Changement d'e-mail",
      body: "Cliquez sur le bouton ci-dessous pour confirmer votre nouvelle adresse e-mail.",
      buttonText: "Confirmer l'e-mail",
      footer: "Si vous n'avez pas demandé ce changement, contactez le support.",
    },
  },
  de: {
    signup: {
      subject: "Bestätige dein TypeWord-Konto",
      heading: "Willkommen bei TypeWord!",
      body: "Danke für deine Anmeldung. Klicke auf den Button, um deine E-Mail-Adresse zu bestätigen.",
      buttonText: "E-Mail bestätigen",
      footer: "Falls du kein TypeWord-Konto erstellt hast, ignoriere diese E-Mail.",
    },
    recovery: {
      subject: "TypeWord Passwort zurücksetzen",
      heading: "Passwort zurücksetzen",
      body: "Wir haben eine Anfrage zum Zurücksetzen deines Passworts erhalten. Klicke unten, um ein neues Passwort festzulegen.",
      buttonText: "Passwort zurücksetzen",
      footer: "Falls du dies nicht angefordert hast, ignoriere diese E-Mail.",
    },
    email_change: {
      subject: "Neue E-Mail-Adresse bestätigen",
      heading: "E-Mail-Änderung",
      body: "Klicke auf den Button, um deine neue E-Mail-Adresse zu bestätigen.",
      buttonText: "E-Mail bestätigen",
      footer: "Falls du diese Änderung nicht angefordert hast, kontaktiere den Support.",
    },
  },
  it: {
    signup: {
      subject: "Conferma il tuo account TypeWord",
      heading: "Benvenuto su TypeWord!",
      body: "Grazie per la registrazione. Clicca il pulsante per confermare il tuo indirizzo email.",
      buttonText: "Conferma email",
      footer: "Se non hai creato un account TypeWord, ignora questa email.",
    },
    recovery: {
      subject: "Reimposta la password di TypeWord",
      heading: "Reimposta password",
      body: "Abbiamo ricevuto una richiesta di reimpostazione della password. Clicca sotto per sceglierne una nuova.",
      buttonText: "Reimposta password",
      footer: "Se non hai richiesto questo, ignora questa email.",
    },
    email_change: {
      subject: "Conferma il nuovo indirizzo email",
      heading: "Cambio email",
      body: "Clicca il pulsante per confermare il tuo nuovo indirizzo email.",
      buttonText: "Conferma email",
      footer: "Se non hai richiesto questa modifica, contatta il supporto.",
    },
  },
  pt: {
    signup: {
      subject: "Confirme sua conta TypeWord",
      heading: "Bem-vindo ao TypeWord!",
      body: "Obrigado por se cadastrar. Clique no botão abaixo para confirmar seu e-mail.",
      buttonText: "Confirmar e-mail",
      footer: "Se você não criou uma conta TypeWord, ignore este e-mail.",
    },
    recovery: {
      subject: "Redefinir sua senha do TypeWord",
      heading: "Redefinir senha",
      body: "Recebemos uma solicitação para redefinir sua senha. Clique abaixo para escolher uma nova.",
      buttonText: "Redefinir senha",
      footer: "Se você não solicitou isso, ignore este e-mail.",
    },
    email_change: {
      subject: "Confirmar novo endereço de e-mail",
      heading: "Alteração de e-mail",
      body: "Clique no botão abaixo para confirmar seu novo endereço de e-mail.",
      buttonText: "Confirmar e-mail",
      footer: "Se você não solicitou esta alteração, entre em contato com o suporte.",
    },
  },
  ru: {
    signup: {
      subject: "Подтвердите аккаунт TypeWord",
      heading: "Добро пожаловать в TypeWord!",
      body: "Спасибо за регистрацию. Нажмите кнопку ниже, чтобы подтвердить адрес электронной почты.",
      buttonText: "Подтвердить",
      footer: "Если вы не создавали аккаунт TypeWord, проигнорируйте это письмо.",
    },
    recovery: {
      subject: "Сброс пароля TypeWord",
      heading: "Сброс пароля",
      body: "Мы получили запрос на сброс пароля. Нажмите кнопку ниже, чтобы задать новый пароль.",
      buttonText: "Сбросить пароль",
      footer: "Если вы не запрашивали сброс, проигнорируйте это письмо.",
    },
    email_change: {
      subject: "Подтверждение нового адреса",
      heading: "Смена email",
      body: "Нажмите кнопку ниже, чтобы подтвердить новый адрес электронной почты.",
      buttonText: "Подтвердить",
      footer: "Если вы не запрашивали изменение, обратитесь в поддержку.",
    },
  },
  vi: {
    signup: {
      subject: "Xác nhận tài khoản TypeWord",
      heading: "Chào mừng đến TypeWord!",
      body: "Cảm ơn bạn đã đăng ký. Nhấn nút bên dưới để xác nhận địa chỉ email.",
      buttonText: "Xác nhận email",
      footer: "Nếu bạn không tạo tài khoản TypeWord, hãy bỏ qua email này.",
    },
    recovery: {
      subject: "Đặt lại mật khẩu TypeWord",
      heading: "Đặt lại mật khẩu",
      body: "Chúng tôi nhận được yêu cầu đặt lại mật khẩu. Nhấn nút bên dưới để chọn mật khẩu mới.",
      buttonText: "Đặt lại mật khẩu",
      footer: "Nếu bạn không yêu cầu, hãy bỏ qua email này.",
    },
    email_change: {
      subject: "Xác nhận địa chỉ email mới",
      heading: "Thay đổi email",
      body: "Nhấn nút bên dưới để xác nhận địa chỉ email mới.",
      buttonText: "Xác nhận email",
      footer: "Nếu bạn không yêu cầu thay đổi, vui lòng liên hệ hỗ trợ.",
    },
  },
  id: {
    signup: {
      subject: "Konfirmasi akun TypeWord Anda",
      heading: "Selamat datang di TypeWord!",
      body: "Terima kasih telah mendaftar. Klik tombol di bawah untuk mengonfirmasi alamat email Anda.",
      buttonText: "Konfirmasi email",
      footer: "Jika Anda tidak membuat akun TypeWord, abaikan email ini.",
    },
    recovery: {
      subject: "Atur ulang kata sandi TypeWord",
      heading: "Atur ulang kata sandi",
      body: "Kami menerima permintaan untuk mengatur ulang kata sandi Anda. Klik tombol di bawah untuk memilih kata sandi baru.",
      buttonText: "Atur ulang",
      footer: "Jika Anda tidak meminta ini, abaikan email ini.",
    },
    email_change: {
      subject: "Konfirmasi alamat email baru",
      heading: "Perubahan email",
      body: "Klik tombol di bawah untuk mengonfirmasi alamat email baru Anda.",
      buttonText: "Konfirmasi email",
      footer: "Jika Anda tidak meminta perubahan ini, hubungi dukungan.",
    },
  },
  th: {
    signup: {
      subject: "ยืนยันบัญชี TypeWord ของคุณ",
      heading: "ยินดีต้อนรับสู่ TypeWord!",
      body: "ขอบคุณที่สมัครสมาชิก กรุณาคลิกปุ่มด้านล่างเพื่อยืนยันอีเมลของคุณ",
      buttonText: "ยืนยันอีเมล",
      footer: "หากคุณไม่ได้สร้างบัญชี TypeWord กรุณาเพิกเฉยอีเมลนี้",
    },
    recovery: {
      subject: "รีเซ็ตรหัสผ่าน TypeWord",
      heading: "รีเซ็ตรหัสผ่าน",
      body: "เราได้รับคำขอรีเซ็ตรหัสผ่าน คลิกปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่",
      buttonText: "รีเซ็ตรหัสผ่าน",
      footer: "หากคุณไม่ได้ขอ กรุณาเพิกเฉยอีเมลนี้",
    },
    email_change: {
      subject: "ยืนยันอีเมลใหม่ของคุณ",
      heading: "เปลี่ยนอีเมล",
      body: "คลิกปุ่มด้านล่างเพื่อยืนยันอีเมลใหม่ของคุณ",
      buttonText: "ยืนยันอีเมล",
      footer: "หากคุณไม่ได้ขอเปลี่ยนแปลง กรุณาติดต่อฝ่ายสนับสนุน",
    },
  },
  ar: {
    signup: {
      subject: "تأكيد حساب TypeWord الخاص بك",
      heading: "!مرحبًا بك في TypeWord",
      body: "شكرًا لتسجيلك. انقر على الزر أدناه لتأكيد عنوان بريدك الإلكتروني.",
      buttonText: "تأكيد البريد",
      footer: "إذا لم تقم بإنشاء حساب TypeWord، يمكنك تجاهل هذا البريد.",
    },
    recovery: {
      subject: "إعادة تعيين كلمة مرور TypeWord",
      heading: "إعادة تعيين كلمة المرور",
      body: "تلقينا طلبًا لإعادة تعيين كلمة المرور. انقر على الزر أدناه لاختيار كلمة مرور جديدة.",
      buttonText: "إعادة تعيين",
      footer: "إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد.",
    },
    email_change: {
      subject: "تأكيد عنوان البريد الجديد",
      heading: "تغيير البريد الإلكتروني",
      body: "انقر على الزر أدناه لتأكيد عنوان بريدك الإلكتروني الجديد.",
      buttonText: "تأكيد البريد",
      footer: "إذا لم تطلب هذا التغيير، يرجى الاتصال بالدعم.",
    },
  },
  hi: {
    signup: {
      subject: "अपने TypeWord खाते की पुष्टि करें",
      heading: "TypeWord में आपका स्वागत है!",
      body: "साइन अप करने के लिए धन्यवाद। अपना ईमेल पता सत्यापित करने के लिए नीचे दिए गए बटन पर क्लिक करें।",
      buttonText: "ईमेल सत्यापित करें",
      footer: "यदि आपने TypeWord खाता नहीं बनाया है, तो इस ईमेल को अनदेखा करें।",
    },
    recovery: {
      subject: "TypeWord पासवर्ड रीसेट करें",
      heading: "पासवर्ड रीसेट",
      body: "हमें पासवर्ड रीसेट का अनुरोध मिला। नया पासवर्ड चुनने के लिए नीचे क्लिक करें।",
      buttonText: "पासवर्ड रीसेट",
      footer: "यदि आपने यह अनुरोध नहीं किया, तो इस ईमेल को अनदेखा करें।",
    },
    email_change: {
      subject: "नया ईमेल पता सत्यापित करें",
      heading: "ईमेल परिवर्तन",
      body: "अपना नया ईमेल पता सत्यापित करने के लिए नीचे दिए गए बटन पर क्लिक करें।",
      buttonText: "ईमेल सत्यापित करें",
      footer: "यदि आपने यह परिवर्तन नहीं किया, तो सहायता से संपर्क करें।",
    },
  },
  tr: {
    signup: {
      subject: "TypeWord hesabınızı onaylayın",
      heading: "TypeWord'e hoş geldiniz!",
      body: "Kaydolduğunuz için teşekkürler. E-posta adresinizi onaylamak için aşağıdaki düğmeye tıklayın.",
      buttonText: "E-postayı onayla",
      footer: "TypeWord hesabı oluşturmadıysanız bu e-postayı görmezden gelebilirsiniz.",
    },
    recovery: {
      subject: "TypeWord şifrenizi sıfırlayın",
      heading: "Şifre sıfırlama",
      body: "Şifre sıfırlama isteği aldık. Yeni şifre belirlemek için aşağıdaki düğmeye tıklayın.",
      buttonText: "Şifreyi sıfırla",
      footer: "Bu isteği siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.",
    },
    email_change: {
      subject: "Yeni e-posta adresinizi onaylayın",
      heading: "E-posta değişikliği",
      body: "Yeni e-posta adresinizi onaylamak için aşağıdaki düğmeye tıklayın.",
      buttonText: "E-postayı onayla",
      footer: "Bu değişikliği talep etmediyseniz destek ile iletişime geçin.",
    },
  },
};

export function getEmailTranslation(
  lang: string,
  actionType: string,
): EmailStrings {
  const locale = t[lang] || t["en"];
  const action = (actionType as ActionType) || "signup";
  return locale[action] || locale["signup"];
}

type NotificationType = "password_changed" | "account_deleted";

const n: Record<string, Record<NotificationType, EmailStrings>> = {
  en: {
    password_changed: {
      subject: "Your TypeWord password was changed",
      heading: "Password Changed",
      body: "Your password was successfully changed. If you did not make this change, please reset your password immediately.",
      buttonText: "",
      footer: "If this wasn't you, contact support immediately.",
    },
    account_deleted: {
      subject: "Your TypeWord account has been deleted",
      heading: "Account Deleted",
      body: "Your account and all associated data have been permanently deleted. We're sorry to see you go.",
      buttonText: "",
      footer: "If this was a mistake, please create a new account at typeword.app.",
    },
  },
  ko: {
    password_changed: {
      subject: "TypeWord 비밀번호가 변경되었습니다",
      heading: "비밀번호 변경 완료",
      body: "비밀번호가 성공적으로 변경되었습니다. 본인이 변경하지 않았다면 즉시 비밀번호를 재설정해주세요.",
      buttonText: "",
      footer: "본인이 변경하지 않았다면 즉시 고객지원에 문의해주세요.",
    },
    account_deleted: {
      subject: "TypeWord 계정이 삭제되었습니다",
      heading: "계정 삭제 완료",
      body: "계정과 모든 관련 데이터가 영구적으로 삭제되었습니다.",
      buttonText: "",
      footer: "실수로 삭제했다면 typeword.app에서 새 계정을 만들어주세요.",
    },
  },
  ja: {
    password_changed: {
      subject: "TypeWord のパスワードが変更されました",
      heading: "パスワード変更完了",
      body: "パスワードが正常に変更されました。心当たりがない場合は、すぐにパスワードをリセットしてください。",
      buttonText: "",
      footer: "心当たりがない場合は、すぐにサポートにお問い合わせください。",
    },
    account_deleted: {
      subject: "TypeWord アカウントが削除されました",
      heading: "アカウント削除完了",
      body: "アカウントとすべての関連データが完全に削除されました。",
      buttonText: "",
      footer: "間違いであれば typeword.app で新しいアカウントを作成してください。",
    },
  },
  zh: {
    password_changed: {
      subject: "您的 TypeWord 密码已更改",
      heading: "密码已更改",
      body: "您的密码已成功更改。如果这不是您的操作，请立即重置密码。",
      buttonText: "",
      footer: "如果这不是您的操作，请立即联系客服。",
    },
    account_deleted: {
      subject: "您的 TypeWord 账户已删除",
      heading: "账户已删除",
      body: "您的账户及所有相关数据已被永久删除。",
      buttonText: "",
      footer: "如果是误操作，请在 typeword.app 创建新账户。",
    },
  },
  es: {
    password_changed: {
      subject: "Tu contraseña de TypeWord ha sido cambiada",
      heading: "Contraseña cambiada",
      body: "Tu contraseña fue cambiada exitosamente. Si no realizaste este cambio, restablece tu contraseña de inmediato.",
      buttonText: "",
      footer: "Si no fuiste tú, contacta con soporte de inmediato.",
    },
    account_deleted: {
      subject: "Tu cuenta de TypeWord ha sido eliminada",
      heading: "Cuenta eliminada",
      body: "Tu cuenta y todos los datos asociados han sido eliminados permanentemente.",
      buttonText: "",
      footer: "Si fue un error, crea una nueva cuenta en typeword.app.",
    },
  },
  fr: {
    password_changed: {
      subject: "Votre mot de passe TypeWord a été modifié",
      heading: "Mot de passe modifié",
      body: "Votre mot de passe a été modifié avec succès. Si vous n'êtes pas à l'origine de ce changement, réinitialisez votre mot de passe immédiatement.",
      buttonText: "",
      footer: "Si ce n'était pas vous, contactez le support immédiatement.",
    },
    account_deleted: {
      subject: "Votre compte TypeWord a été supprimé",
      heading: "Compte supprimé",
      body: "Votre compte et toutes les données associées ont été définitivement supprimés.",
      buttonText: "",
      footer: "Si c'est une erreur, créez un nouveau compte sur typeword.app.",
    },
  },
  de: {
    password_changed: {
      subject: "Dein TypeWord-Passwort wurde geändert",
      heading: "Passwort geändert",
      body: "Dein Passwort wurde erfolgreich geändert. Falls du diese Änderung nicht vorgenommen hast, setze dein Passwort sofort zurück.",
      buttonText: "",
      footer: "Falls du es nicht warst, kontaktiere sofort den Support.",
    },
    account_deleted: {
      subject: "Dein TypeWord-Konto wurde gelöscht",
      heading: "Konto gelöscht",
      body: "Dein Konto und alle zugehörigen Daten wurden dauerhaft gelöscht.",
      buttonText: "",
      footer: "Falls es ein Fehler war, erstelle ein neues Konto auf typeword.app.",
    },
  },
  it: {
    password_changed: {
      subject: "La tua password TypeWord è stata modificata",
      heading: "Password modificata",
      body: "La tua password è stata modificata con successo. Se non sei stato tu, reimposta la password immediatamente.",
      buttonText: "",
      footer: "Se non sei stato tu, contatta immediatamente il supporto.",
    },
    account_deleted: {
      subject: "Il tuo account TypeWord è stato eliminato",
      heading: "Account eliminato",
      body: "Il tuo account e tutti i dati associati sono stati eliminati definitivamente.",
      buttonText: "",
      footer: "Se è stato un errore, crea un nuovo account su typeword.app.",
    },
  },
  pt: {
    password_changed: {
      subject: "Sua senha do TypeWord foi alterada",
      heading: "Senha alterada",
      body: "Sua senha foi alterada com sucesso. Se não foi você, redefina sua senha imediatamente.",
      buttonText: "",
      footer: "Se não foi você, entre em contato com o suporte imediatamente.",
    },
    account_deleted: {
      subject: "Sua conta TypeWord foi excluída",
      heading: "Conta excluída",
      body: "Sua conta e todos os dados associados foram excluídos permanentemente.",
      buttonText: "",
      footer: "Se foi um erro, crie uma nova conta em typeword.app.",
    },
  },
  ru: {
    password_changed: {
      subject: "Ваш пароль TypeWord был изменён",
      heading: "Пароль изменён",
      body: "Ваш пароль был успешно изменён. Если это были не вы, немедленно сбросьте пароль.",
      buttonText: "",
      footer: "Если это были не вы, немедленно свяжитесь с поддержкой.",
    },
    account_deleted: {
      subject: "Ваш аккаунт TypeWord был удалён",
      heading: "Аккаунт удалён",
      body: "Ваш аккаунт и все связанные данные были безвозвратно удалены.",
      buttonText: "",
      footer: "Если это ошибка, создайте новый аккаунт на typeword.app.",
    },
  },
  vi: {
    password_changed: {
      subject: "Mật khẩu TypeWord của bạn đã được thay đổi",
      heading: "Đã đổi mật khẩu",
      body: "Mật khẩu của bạn đã được thay đổi thành công. Nếu không phải bạn, hãy đặt lại mật khẩu ngay.",
      buttonText: "",
      footer: "Nếu không phải bạn, hãy liên hệ hỗ trợ ngay.",
    },
    account_deleted: {
      subject: "Tài khoản TypeWord của bạn đã bị xóa",
      heading: "Đã xóa tài khoản",
      body: "Tài khoản và tất cả dữ liệu liên quan đã bị xóa vĩnh viễn.",
      buttonText: "",
      footer: "Nếu là nhầm lẫn, hãy tạo tài khoản mới tại typeword.app.",
    },
  },
  id: {
    password_changed: {
      subject: "Kata sandi TypeWord Anda telah diubah",
      heading: "Kata sandi diubah",
      body: "Kata sandi Anda berhasil diubah. Jika ini bukan Anda, segera atur ulang kata sandi.",
      buttonText: "",
      footer: "Jika ini bukan Anda, segera hubungi dukungan.",
    },
    account_deleted: {
      subject: "Akun TypeWord Anda telah dihapus",
      heading: "Akun dihapus",
      body: "Akun dan semua data terkait telah dihapus secara permanen.",
      buttonText: "",
      footer: "Jika ini kesalahan, buat akun baru di typeword.app.",
    },
  },
  th: {
    password_changed: {
      subject: "รหัสผ่าน TypeWord ของคุณถูกเปลี่ยนแล้ว",
      heading: "เปลี่ยนรหัสผ่านแล้ว",
      body: "รหัสผ่านของคุณถูกเปลี่ยนเรียบร้อยแล้ว หากไม่ใช่คุณ กรุณารีเซ็ตรหัสผ่านทันที",
      buttonText: "",
      footer: "หากไม่ใช่คุณ กรุณาติดต่อฝ่ายสนับสนุนทันที",
    },
    account_deleted: {
      subject: "บัญชี TypeWord ของคุณถูกลบแล้ว",
      heading: "ลบบัญชีแล้ว",
      body: "บัญชีและข้อมูลทั้งหมดถูกลบอย่างถาวรแล้ว",
      buttonText: "",
      footer: "หากเป็นความผิดพลาด สร้างบัญชีใหม่ได้ที่ typeword.app",
    },
  },
  ar: {
    password_changed: {
      subject: "تم تغيير كلمة مرور TypeWord",
      heading: "تم تغيير كلمة المرور",
      body: "تم تغيير كلمة المرور بنجاح. إذا لم تقم بذلك، أعد تعيين كلمة المرور فورًا.",
      buttonText: "",
      footer: "إذا لم تكن أنت، اتصل بالدعم فورًا.",
    },
    account_deleted: {
      subject: "تم حذف حساب TypeWord الخاص بك",
      heading: "تم حذف الحساب",
      body: "تم حذف حسابك وجميع البيانات المرتبطة به نهائيًا.",
      buttonText: "",
      footer: "إذا كان ذلك خطأ، أنشئ حسابًا جديدًا على typeword.app.",
    },
  },
  hi: {
    password_changed: {
      subject: "आपका TypeWord पासवर्ड बदल दिया गया",
      heading: "पासवर्ड बदला गया",
      body: "आपका पासवर्ड सफलतापूर्वक बदल दिया गया। अगर यह आपने नहीं किया, तो तुरंत पासवर्ड रीसेट करें।",
      buttonText: "",
      footer: "अगर यह आप नहीं थे, तो तुरंत सहायता से संपर्क करें।",
    },
    account_deleted: {
      subject: "आपका TypeWord खाता हटा दिया गया",
      heading: "खाता हटाया गया",
      body: "आपका खाता और सभी संबंधित डेटा स्थायी रूप से हटा दिया गया है।",
      buttonText: "",
      footer: "अगर यह गलती थी, तो typeword.app पर नया खाता बनाएं।",
    },
  },
  tr: {
    password_changed: {
      subject: "TypeWord şifreniz değiştirildi",
      heading: "Şifre değiştirildi",
      body: "Şifreniz başarıyla değiştirildi. Bunu siz yapmadıysanız, şifrenizi hemen sıfırlayın.",
      buttonText: "",
      footer: "Bu siz değilseniz, derhal destek ile iletişime geçin.",
    },
    account_deleted: {
      subject: "TypeWord hesabınız silindi",
      heading: "Hesap silindi",
      body: "Hesabınız ve tüm ilişkili veriler kalıcı olarak silindi.",
      buttonText: "",
      footer: "Bu bir hataydıysa, typeword.app adresinden yeni hesap oluşturun.",
    },
  },
};

export function getNotificationEmailTranslation(
  lang: string,
  type: string,
): EmailStrings {
  const locale = n[lang] || n["en"];
  return locale[type as NotificationType] || locale["password_changed"];
}
