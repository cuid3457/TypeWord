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
      subject: "Confirm your MoaVoca account",
      heading: "Welcome to MoaVoca!",
      body: "Thank you for signing up. Please confirm your email address by clicking the button below.",
      buttonText: "Confirm Email",
      footer: "If you didn't create a MoaVoca account, you can safely ignore this email.",
    },
    recovery: {
      subject: "Reset your MoaVoca password",
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
      subject: "MoaVoca 이메일 인증",
      heading: "MoaVoca에 오신 것을 환영합니다!",
      body: "회원가입해 주셔서 감사합니다. 아래 버튼을 클릭하여 이메일 주소를 인증해주세요.",
      buttonText: "이메일 인증",
      footer: "MoaVoca 계정을 만들지 않으셨다면 이 이메일을 무시해주세요.",
    },
    recovery: {
      subject: "MoaVoca 비밀번호 재설정",
      heading: "비밀번호 재설정",
      body: "비밀번호 재설정 요청을 받았습니다. 아래 버튼을 클릭하여 새 비밀번호를 설정해주세요.",
      buttonText: "비밀번호 재설정",
      footer: "비밀번호 재설정을 요청하지 않으셨다면 이 이메일을 무시해주세요.",
    },
    email_change: {
      subject: "MoaVoca 이메일 변경 인증",
      heading: "이메일 변경",
      body: "아래 버튼을 클릭하여 새 이메일 주소를 인증해주세요.",
      buttonText: "이메일 인증",
      footer: "이메일 변경을 요청하지 않으셨다면 고객지원으로 연락해주세요.",
    },
  },
  ja: {
    signup: {
      subject: "MoaVoca アカウントの確認",
      heading: "MoaVoca へようこそ！",
      body: "ご登録ありがとうございます。下のボタンをクリックしてメールアドレスを確認してください。",
      buttonText: "メール確認",
      footer: "MoaVoca アカウントを作成していない場合、このメールは無視してください。",
    },
    recovery: {
      subject: "MoaVoca パスワードのリセット",
      heading: "パスワードリセット",
      body: "パスワードリセットのリクエストを受け付けました。下のボタンをクリックして新しいパスワードを設定してください。",
      buttonText: "パスワードリセット",
      footer: "リクエストしていない場合、このメールは無視してください。",
    },
    email_change: {
      subject: "MoaVoca メールアドレスの変更確認",
      heading: "メールアドレスの変更",
      body: "下のボタンをクリックして新しいメールアドレスを確認してください。",
      buttonText: "メール確認",
      footer: "変更をリクエストしていない場合、サポートにご連絡ください。",
    },
  },
  zh: {
    signup: {
      subject: "确认您的 MoaVoca 账户",
      heading: "欢迎使用 MoaVoca！",
      body: "感谢您注册。请点击下方按钮确认您的电子邮箱地址。",
      buttonText: "确认邮箱",
      footer: "如果您没有创建 MoaVoca 账户，请忽略此邮件。",
    },
    recovery: {
      subject: "重置您的 MoaVoca 密码",
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
      subject: "Confirma tu cuenta de MoaVoca",
      heading: "¡Bienvenido a MoaVoca!",
      body: "Gracias por registrarte. Haz clic en el botón para confirmar tu dirección de correo.",
      buttonText: "Confirmar correo",
      footer: "Si no creaste una cuenta en MoaVoca, puedes ignorar este correo.",
    },
    recovery: {
      subject: "Restablecer tu contraseña de MoaVoca",
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
      subject: "Confirmez votre compte MoaVoca",
      heading: "Bienvenue sur MoaVoca !",
      body: "Merci de vous être inscrit. Cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail.",
      buttonText: "Confirmer l'e-mail",
      footer: "Si vous n'avez pas créé de compte MoaVoca, ignorez cet e-mail.",
    },
    recovery: {
      subject: "Réinitialiser votre mot de passe MoaVoca",
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
      subject: "Bestätige dein MoaVoca-Konto",
      heading: "Willkommen bei MoaVoca!",
      body: "Danke für deine Anmeldung. Klicke auf den Button, um deine E-Mail-Adresse zu bestätigen.",
      buttonText: "E-Mail bestätigen",
      footer: "Falls du kein MoaVoca-Konto erstellt hast, ignoriere diese E-Mail.",
    },
    recovery: {
      subject: "MoaVoca Passwort zurücksetzen",
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
      subject: "Conferma il tuo account MoaVoca",
      heading: "Benvenuto su MoaVoca!",
      body: "Grazie per la registrazione. Clicca il pulsante per confermare il tuo indirizzo email.",
      buttonText: "Conferma email",
      footer: "Se non hai creato un account MoaVoca, ignora questa email.",
    },
    recovery: {
      subject: "Reimposta la password di MoaVoca",
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
      subject: "Confirme sua conta MoaVoca",
      heading: "Bem-vindo ao MoaVoca!",
      body: "Obrigado por se cadastrar. Clique no botão abaixo para confirmar seu e-mail.",
      buttonText: "Confirmar e-mail",
      footer: "Se você não criou uma conta MoaVoca, ignore este e-mail.",
    },
    recovery: {
      subject: "Redefinir sua senha do MoaVoca",
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
      subject: "Подтвердите аккаунт MoaVoca",
      heading: "Добро пожаловать в MoaVoca!",
      body: "Спасибо за регистрацию. Нажмите кнопку ниже, чтобы подтвердить адрес электронной почты.",
      buttonText: "Подтвердить",
      footer: "Если вы не создавали аккаунт MoaVoca, проигнорируйте это письмо.",
    },
    recovery: {
      subject: "Сброс пароля MoaVoca",
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
      subject: "Xác nhận tài khoản MoaVoca",
      heading: "Chào mừng đến MoaVoca!",
      body: "Cảm ơn bạn đã đăng ký. Nhấn nút bên dưới để xác nhận địa chỉ email.",
      buttonText: "Xác nhận email",
      footer: "Nếu bạn không tạo tài khoản MoaVoca, hãy bỏ qua email này.",
    },
    recovery: {
      subject: "Đặt lại mật khẩu MoaVoca",
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
      subject: "Konfirmasi akun MoaVoca Anda",
      heading: "Selamat datang di MoaVoca!",
      body: "Terima kasih telah mendaftar. Klik tombol di bawah untuk mengonfirmasi alamat email Anda.",
      buttonText: "Konfirmasi email",
      footer: "Jika Anda tidak membuat akun MoaVoca, abaikan email ini.",
    },
    recovery: {
      subject: "Atur ulang kata sandi MoaVoca",
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
      subject: "ยืนยันบัญชี MoaVoca ของคุณ",
      heading: "ยินดีต้อนรับสู่ MoaVoca!",
      body: "ขอบคุณที่สมัครสมาชิก กรุณาคลิกปุ่มด้านล่างเพื่อยืนยันอีเมลของคุณ",
      buttonText: "ยืนยันอีเมล",
      footer: "หากคุณไม่ได้สร้างบัญชี MoaVoca กรุณาเพิกเฉยอีเมลนี้",
    },
    recovery: {
      subject: "รีเซ็ตรหัสผ่าน MoaVoca",
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
      subject: "تأكيد حساب MoaVoca الخاص بك",
      heading: "!مرحبًا بك في MoaVoca",
      body: "شكرًا لتسجيلك. انقر على الزر أدناه لتأكيد عنوان بريدك الإلكتروني.",
      buttonText: "تأكيد البريد",
      footer: "إذا لم تقم بإنشاء حساب MoaVoca، يمكنك تجاهل هذا البريد.",
    },
    recovery: {
      subject: "إعادة تعيين كلمة مرور MoaVoca",
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
      subject: "अपने MoaVoca खाते की पुष्टि करें",
      heading: "MoaVoca में आपका स्वागत है!",
      body: "साइन अप करने के लिए धन्यवाद। अपना ईमेल पता सत्यापित करने के लिए नीचे दिए गए बटन पर क्लिक करें।",
      buttonText: "ईमेल सत्यापित करें",
      footer: "यदि आपने MoaVoca खाता नहीं बनाया है, तो इस ईमेल को अनदेखा करें।",
    },
    recovery: {
      subject: "MoaVoca पासवर्ड रीसेट करें",
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
      subject: "MoaVoca hesabınızı onaylayın",
      heading: "MoaVoca'e hoş geldiniz!",
      body: "Kaydolduğunuz için teşekkürler. E-posta adresinizi onaylamak için aşağıdaki düğmeye tıklayın.",
      buttonText: "E-postayı onayla",
      footer: "MoaVoca hesabı oluşturmadıysanız bu e-postayı görmezden gelebilirsiniz.",
    },
    recovery: {
      subject: "MoaVoca şifrenizi sıfırlayın",
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
  const locale = t[lang] || t[lang.split("-")[0]] || t["en"];
  const action = (actionType as ActionType) || "signup";
  return locale[action] || locale["signup"];
}

type NotificationType = "password_changed" | "account_deleted";

const n: Record<string, Record<NotificationType, EmailStrings>> = {
  en: {
    password_changed: {
      subject: "Your MoaVoca password was changed",
      heading: "Password Changed",
      body: "Your password was successfully changed. If you did not make this change, please reset your password immediately.",
      buttonText: "",
      footer: "If this wasn't you, contact support immediately.",
    },
    account_deleted: {
      subject: "Your MoaVoca account has been deleted",
      heading: "Account Deleted",
      body: "Your account and all associated data have been permanently deleted. We're sorry to see you go.",
      buttonText: "",
      footer: "If this was a mistake, please create a new account at moavoca.com.",
    },
  },
  ko: {
    password_changed: {
      subject: "MoaVoca 비밀번호가 변경되었습니다",
      heading: "비밀번호 변경 완료",
      body: "비밀번호가 성공적으로 변경되었습니다. 본인이 변경하지 않았다면 즉시 비밀번호를 재설정해주세요.",
      buttonText: "",
      footer: "본인이 변경하지 않았다면 즉시 고객지원에 문의해주세요.",
    },
    account_deleted: {
      subject: "MoaVoca 계정이 삭제되었습니다",
      heading: "계정 삭제 완료",
      body: "계정과 모든 관련 데이터가 영구적으로 삭제되었습니다.",
      buttonText: "",
      footer: "실수로 삭제했다면 moavoca.com에서 새 계정을 만들어주세요.",
    },
  },
  ja: {
    password_changed: {
      subject: "MoaVoca のパスワードが変更されました",
      heading: "パスワード変更完了",
      body: "パスワードが正常に変更されました。心当たりがない場合は、すぐにパスワードをリセットしてください。",
      buttonText: "",
      footer: "心当たりがない場合は、すぐにサポートにお問い合わせください。",
    },
    account_deleted: {
      subject: "MoaVoca アカウントが削除されました",
      heading: "アカウント削除完了",
      body: "アカウントとすべての関連データが完全に削除されました。",
      buttonText: "",
      footer: "間違いであれば moavoca.com で新しいアカウントを作成してください。",
    },
  },
  zh: {
    password_changed: {
      subject: "您的 MoaVoca 密码已更改",
      heading: "密码已更改",
      body: "您的密码已成功更改。如果这不是您的操作，请立即重置密码。",
      buttonText: "",
      footer: "如果这不是您的操作，请立即联系客服。",
    },
    account_deleted: {
      subject: "您的 MoaVoca 账户已删除",
      heading: "账户已删除",
      body: "您的账户及所有相关数据已被永久删除。",
      buttonText: "",
      footer: "如果是误操作，请在 moavoca.com 创建新账户。",
    },
  },
  es: {
    password_changed: {
      subject: "Tu contraseña de MoaVoca ha sido cambiada",
      heading: "Contraseña cambiada",
      body: "Tu contraseña fue cambiada exitosamente. Si no realizaste este cambio, restablece tu contraseña de inmediato.",
      buttonText: "",
      footer: "Si no fuiste tú, contacta con soporte de inmediato.",
    },
    account_deleted: {
      subject: "Tu cuenta de MoaVoca ha sido eliminada",
      heading: "Cuenta eliminada",
      body: "Tu cuenta y todos los datos asociados han sido eliminados permanentemente.",
      buttonText: "",
      footer: "Si fue un error, crea una nueva cuenta en moavoca.com.",
    },
  },
  fr: {
    password_changed: {
      subject: "Votre mot de passe MoaVoca a été modifié",
      heading: "Mot de passe modifié",
      body: "Votre mot de passe a été modifié avec succès. Si vous n'êtes pas à l'origine de ce changement, réinitialisez votre mot de passe immédiatement.",
      buttonText: "",
      footer: "Si ce n'était pas vous, contactez le support immédiatement.",
    },
    account_deleted: {
      subject: "Votre compte MoaVoca a été supprimé",
      heading: "Compte supprimé",
      body: "Votre compte et toutes les données associées ont été définitivement supprimés.",
      buttonText: "",
      footer: "Si c'est une erreur, créez un nouveau compte sur moavoca.com.",
    },
  },
  de: {
    password_changed: {
      subject: "Dein MoaVoca-Passwort wurde geändert",
      heading: "Passwort geändert",
      body: "Dein Passwort wurde erfolgreich geändert. Falls du diese Änderung nicht vorgenommen hast, setze dein Passwort sofort zurück.",
      buttonText: "",
      footer: "Falls du es nicht warst, kontaktiere sofort den Support.",
    },
    account_deleted: {
      subject: "Dein MoaVoca-Konto wurde gelöscht",
      heading: "Konto gelöscht",
      body: "Dein Konto und alle zugehörigen Daten wurden dauerhaft gelöscht.",
      buttonText: "",
      footer: "Falls es ein Fehler war, erstelle ein neues Konto auf moavoca.com.",
    },
  },
  it: {
    password_changed: {
      subject: "La tua password MoaVoca è stata modificata",
      heading: "Password modificata",
      body: "La tua password è stata modificata con successo. Se non sei stato tu, reimposta la password immediatamente.",
      buttonText: "",
      footer: "Se non sei stato tu, contatta immediatamente il supporto.",
    },
    account_deleted: {
      subject: "Il tuo account MoaVoca è stato eliminato",
      heading: "Account eliminato",
      body: "Il tuo account e tutti i dati associati sono stati eliminati definitivamente.",
      buttonText: "",
      footer: "Se è stato un errore, crea un nuovo account su moavoca.com.",
    },
  },
  pt: {
    password_changed: {
      subject: "Sua senha do MoaVoca foi alterada",
      heading: "Senha alterada",
      body: "Sua senha foi alterada com sucesso. Se não foi você, redefina sua senha imediatamente.",
      buttonText: "",
      footer: "Se não foi você, entre em contato com o suporte imediatamente.",
    },
    account_deleted: {
      subject: "Sua conta MoaVoca foi excluída",
      heading: "Conta excluída",
      body: "Sua conta e todos os dados associados foram excluídos permanentemente.",
      buttonText: "",
      footer: "Se foi um erro, crie uma nova conta em moavoca.com.",
    },
  },
  ru: {
    password_changed: {
      subject: "Ваш пароль MoaVoca был изменён",
      heading: "Пароль изменён",
      body: "Ваш пароль был успешно изменён. Если это были не вы, немедленно сбросьте пароль.",
      buttonText: "",
      footer: "Если это были не вы, немедленно свяжитесь с поддержкой.",
    },
    account_deleted: {
      subject: "Ваш аккаунт MoaVoca был удалён",
      heading: "Аккаунт удалён",
      body: "Ваш аккаунт и все связанные данные были безвозвратно удалены.",
      buttonText: "",
      footer: "Если это ошибка, создайте новый аккаунт на moavoca.com.",
    },
  },
  vi: {
    password_changed: {
      subject: "Mật khẩu MoaVoca của bạn đã được thay đổi",
      heading: "Đã đổi mật khẩu",
      body: "Mật khẩu của bạn đã được thay đổi thành công. Nếu không phải bạn, hãy đặt lại mật khẩu ngay.",
      buttonText: "",
      footer: "Nếu không phải bạn, hãy liên hệ hỗ trợ ngay.",
    },
    account_deleted: {
      subject: "Tài khoản MoaVoca của bạn đã bị xóa",
      heading: "Đã xóa tài khoản",
      body: "Tài khoản và tất cả dữ liệu liên quan đã bị xóa vĩnh viễn.",
      buttonText: "",
      footer: "Nếu là nhầm lẫn, hãy tạo tài khoản mới tại moavoca.com.",
    },
  },
  id: {
    password_changed: {
      subject: "Kata sandi MoaVoca Anda telah diubah",
      heading: "Kata sandi diubah",
      body: "Kata sandi Anda berhasil diubah. Jika ini bukan Anda, segera atur ulang kata sandi.",
      buttonText: "",
      footer: "Jika ini bukan Anda, segera hubungi dukungan.",
    },
    account_deleted: {
      subject: "Akun MoaVoca Anda telah dihapus",
      heading: "Akun dihapus",
      body: "Akun dan semua data terkait telah dihapus secara permanen.",
      buttonText: "",
      footer: "Jika ini kesalahan, buat akun baru di moavoca.com.",
    },
  },
  th: {
    password_changed: {
      subject: "รหัสผ่าน MoaVoca ของคุณถูกเปลี่ยนแล้ว",
      heading: "เปลี่ยนรหัสผ่านแล้ว",
      body: "รหัสผ่านของคุณถูกเปลี่ยนเรียบร้อยแล้ว หากไม่ใช่คุณ กรุณารีเซ็ตรหัสผ่านทันที",
      buttonText: "",
      footer: "หากไม่ใช่คุณ กรุณาติดต่อฝ่ายสนับสนุนทันที",
    },
    account_deleted: {
      subject: "บัญชี MoaVoca ของคุณถูกลบแล้ว",
      heading: "ลบบัญชีแล้ว",
      body: "บัญชีและข้อมูลทั้งหมดถูกลบอย่างถาวรแล้ว",
      buttonText: "",
      footer: "หากเป็นความผิดพลาด สร้างบัญชีใหม่ได้ที่ moavoca.com",
    },
  },
  ar: {
    password_changed: {
      subject: "تم تغيير كلمة مرور MoaVoca",
      heading: "تم تغيير كلمة المرور",
      body: "تم تغيير كلمة المرور بنجاح. إذا لم تقم بذلك، أعد تعيين كلمة المرور فورًا.",
      buttonText: "",
      footer: "إذا لم تكن أنت، اتصل بالدعم فورًا.",
    },
    account_deleted: {
      subject: "تم حذف حساب MoaVoca الخاص بك",
      heading: "تم حذف الحساب",
      body: "تم حذف حسابك وجميع البيانات المرتبطة به نهائيًا.",
      buttonText: "",
      footer: "إذا كان ذلك خطأ، أنشئ حسابًا جديدًا على moavoca.com.",
    },
  },
  hi: {
    password_changed: {
      subject: "आपका MoaVoca पासवर्ड बदल दिया गया",
      heading: "पासवर्ड बदला गया",
      body: "आपका पासवर्ड सफलतापूर्वक बदल दिया गया। अगर यह आपने नहीं किया, तो तुरंत पासवर्ड रीसेट करें।",
      buttonText: "",
      footer: "अगर यह आप नहीं थे, तो तुरंत सहायता से संपर्क करें।",
    },
    account_deleted: {
      subject: "आपका MoaVoca खाता हटा दिया गया",
      heading: "खाता हटाया गया",
      body: "आपका खाता और सभी संबंधित डेटा स्थायी रूप से हटा दिया गया है।",
      buttonText: "",
      footer: "अगर यह गलती थी, तो moavoca.com पर नया खाता बनाएं।",
    },
  },
  tr: {
    password_changed: {
      subject: "MoaVoca şifreniz değiştirildi",
      heading: "Şifre değiştirildi",
      body: "Şifreniz başarıyla değiştirildi. Bunu siz yapmadıysanız, şifrenizi hemen sıfırlayın.",
      buttonText: "",
      footer: "Bu siz değilseniz, derhal destek ile iletişime geçin.",
    },
    account_deleted: {
      subject: "MoaVoca hesabınız silindi",
      heading: "Hesap silindi",
      body: "Hesabınız ve tüm ilişkili veriler kalıcı olarak silindi.",
      buttonText: "",
      footer: "Bu bir hataydıysa, moavoca.com adresinden yeni hesap oluşturun.",
    },
  },
};

export function getNotificationEmailTranslation(
  lang: string,
  type: string,
): EmailStrings {
  const locale = n[lang] || n[lang.split("-")[0]] || n["en"];
  return locale[type as NotificationType] || locale["password_changed"];
}

// Subscription lifecycle emails — triggered by RevenueCat webhook events
// (INITIAL_PURCHASE, CANCELLATION, BILLING_ISSUE/EXPIRATION) and a daily
// trial-ending cron. 8 languages aligned with app UI locales.
type SubscriptionEmailType =
  | "subscription_welcome"
  | "trial_ending_soon"
  | "subscription_cancelled"
  | "subscription_renewal_failed";

const s: Record<string, Record<SubscriptionEmailType, EmailStrings>> = {
  en: {
    subscription_welcome: {
      subject: "Welcome to MoaVoca Premium!",
      heading: "You're now Premium",
      body: "Thank you for subscribing to MoaVoca Premium. All features are now unlocked: unlimited reviews, no ads, image word search, PDF export, and unlimited wordlists. Open the app to start exploring.",
      buttonText: "",
      footer: "Questions? Reply to this email or visit moavoca.com.",
    },
    trial_ending_soon: {
      subject: "Your MoaVoca Premium trial ends in 2 days",
      heading: "Trial ending soon",
      body: "Your 7-day free trial of MoaVoca Premium ends in 2 days. After that, you'll be charged for your subscription. Cancel anytime in your App Store or Google Play account settings to avoid being charged.",
      buttonText: "",
      footer: "Loving Premium? No action needed — your subscription continues automatically.",
    },
    subscription_cancelled: {
      subject: "Your MoaVoca Premium subscription was cancelled",
      heading: "Subscription cancelled",
      body: "Your MoaVoca Premium subscription has been cancelled. You'll continue to have access to Premium features until the end of your current billing period. You can resubscribe anytime from within the app.",
      buttonText: "",
      footer: "Got feedback? We'd love to hear why you cancelled. Reply to this email.",
    },
    subscription_renewal_failed: {
      subject: "MoaVoca Premium renewal failed",
      heading: "Payment issue",
      body: "We couldn't renew your MoaVoca Premium subscription. This is usually due to expired or insufficient payment information. Please update your payment method in your App Store or Google Play account settings to keep your Premium access.",
      buttonText: "",
      footer: "Your subscription will end if not resolved within a few days.",
    },
  },
  ko: {
    subscription_welcome: {
      subject: "MoaVoca Premium 구독 환영합니다",
      heading: "프리미엄 활성화 완료",
      body: "MoaVoca Premium 구독 감사합니다. 무제한 복습, 광고 제거, 이미지 단어 검색, PDF 내보내기, 무제한 단어장 등 모든 기능이 활성화되었습니다.",
      buttonText: "",
      footer: "문의는 본 이메일에 답장하시거나 moavoca.com을 방문해주세요.",
    },
    trial_ending_soon: {
      subject: "MoaVoca Premium 무료 평가판 종료 2일 전",
      heading: "무료 평가판 곧 종료",
      body: "MoaVoca Premium 7일 무료 평가판이 2일 후 종료됩니다. 종료 후에는 구독료가 청구됩니다. 청구를 원치 않으시면 App Store 또는 Google Play 계정 설정에서 언제든 취소할 수 있습니다.",
      buttonText: "",
      footer: "계속 사용하시려면 추가 조치는 필요 없습니다. 구독이 자동으로 유지됩니다.",
    },
    subscription_cancelled: {
      subject: "MoaVoca Premium 구독이 취소되었습니다",
      heading: "구독 취소 완료",
      body: "MoaVoca Premium 구독이 취소되었습니다. 현재 결제 주기가 끝날 때까지는 프리미엄 기능을 계속 사용하실 수 있습니다. 앱 내에서 언제든 다시 구독하실 수 있습니다.",
      buttonText: "",
      footer: "피드백 주실 수 있다면 감사하겠습니다. 본 이메일에 답장 주세요.",
    },
    subscription_renewal_failed: {
      subject: "MoaVoca Premium 갱신 결제 실패",
      heading: "결제 문제 발생",
      body: "MoaVoca Premium 구독 갱신 결제가 실패했습니다. 보통 결제 정보 만료 또는 잔액 부족 때문입니다. 프리미엄 사용을 유지하시려면 App Store 또는 Google Play 계정 설정에서 결제 방법을 업데이트해주세요.",
      buttonText: "",
      footer: "며칠 내 해결되지 않으면 구독이 종료됩니다.",
    },
  },
  ja: {
    subscription_welcome: {
      subject: "MoaVoca Premium にご登録ありがとうございます",
      heading: "プレミアム機能が有効になりました",
      body: "MoaVoca Premium ご登録ありがとうございます。無制限の復習、広告なし、画像単語検索、PDF エクスポート、無制限の単語帳など、すべての機能がご利用いただけます。",
      buttonText: "",
      footer: "お問い合わせは本メールへの返信または moavoca.com からお願いします。",
    },
    trial_ending_soon: {
      subject: "MoaVoca Premium 無料試用が 2 日後に終了",
      heading: "無料試用がもうすぐ終了",
      body: "MoaVoca Premium の 7 日間無料試用が 2 日後に終了します。終了後はサブスクリプション料金が請求されます。請求を望まない場合は、App Store または Google Play のアカウント設定からいつでもキャンセルできます。",
      buttonText: "",
      footer: "プレミアムを続けたい場合は、何もしなくてもサブスクリプションは自動的に継続されます。",
    },
    subscription_cancelled: {
      subject: "MoaVoca Premium のサブスクリプションがキャンセルされました",
      heading: "サブスクリプション キャンセル完了",
      body: "MoaVoca Premium のサブスクリプションがキャンセルされました。現在の請求期間終了までプレミアム機能をご利用いただけます。アプリ内からいつでも再登録できます。",
      buttonText: "",
      footer: "フィードバックがあればぜひお聞かせください。本メールに返信してください。",
    },
    subscription_renewal_failed: {
      subject: "MoaVoca Premium の更新に失敗しました",
      heading: "決済の問題",
      body: "MoaVoca Premium のサブスクリプション更新ができませんでした。通常、決済情報の有効期限切れまたは残高不足が原因です。プレミアム機能を維持するには、App Store または Google Play のアカウント設定で決済方法を更新してください。",
      buttonText: "",
      footer: "数日以内に解決されない場合、サブスクリプションは終了します。",
    },
  },
  zh: {
    subscription_welcome: {
      subject: "欢迎订阅 MoaVoca Premium",
      heading: "高级功能已激活",
      body: "感谢您订阅 MoaVoca Premium。无限复习、无广告、图片单词搜索、PDF 导出、无限词单等所有功能现已可用。",
      buttonText: "",
      footer: "如有问题，请回复此邮件或访问 moavoca.com。",
    },
    trial_ending_soon: {
      subject: "您的 MoaVoca Premium 试用将在 2 天后结束",
      heading: "试用即将结束",
      body: "您的 MoaVoca Premium 7 天免费试用将在 2 天后结束。结束后将收取订阅费用。如不希望被收费，请随时在 App Store 或 Google Play 账户设置中取消。",
      buttonText: "",
      footer: "如想继续使用，无需任何操作 — 订阅将自动续费。",
    },
    subscription_cancelled: {
      subject: "您的 MoaVoca Premium 订阅已取消",
      heading: "订阅取消完成",
      body: "您的 MoaVoca Premium 订阅已取消。在当前计费周期结束前，您仍可使用高级功能。可以随时在应用内重新订阅。",
      buttonText: "",
      footer: "如有反馈，欢迎告诉我们取消的原因。请回复此邮件。",
    },
    subscription_renewal_failed: {
      subject: "MoaVoca Premium 续费失败",
      heading: "付款问题",
      body: "我们无法续订您的 MoaVoca Premium 订阅。通常是由于付款信息过期或余额不足。请在 App Store 或 Google Play 账户设置中更新付款方式以保持高级功能。",
      buttonText: "",
      footer: "如果几天内未解决，订阅将结束。",
    },
  },
  es: {
    subscription_welcome: {
      subject: "Bienvenido a MoaVoca Premium",
      heading: "Premium activado",
      body: "Gracias por suscribirte a MoaVoca Premium. Todas las funciones están desbloqueadas: repasos ilimitados, sin anuncios, búsqueda de palabras por imagen, exportación PDF y listas ilimitadas.",
      buttonText: "",
      footer: "¿Preguntas? Responde a este correo o visita moavoca.com.",
    },
    trial_ending_soon: {
      subject: "Tu prueba de MoaVoca Premium termina en 2 días",
      heading: "La prueba está por terminar",
      body: "Tu prueba gratuita de 7 días de MoaVoca Premium termina en 2 días. Después se cobrará tu suscripción. Cancela en cualquier momento desde la configuración de App Store o Google Play para evitar el cargo.",
      buttonText: "",
      footer: "¿Te encanta Premium? No hace falta hacer nada — tu suscripción continúa automáticamente.",
    },
    subscription_cancelled: {
      subject: "Tu suscripción a MoaVoca Premium fue cancelada",
      heading: "Suscripción cancelada",
      body: "Tu suscripción a MoaVoca Premium ha sido cancelada. Seguirás teniendo acceso a las funciones Premium hasta el final del período de facturación actual. Puedes resuscribirte en cualquier momento desde la app.",
      buttonText: "",
      footer: "¿Comentarios? Nos encantaría saber por qué cancelaste. Responde a este correo.",
    },
    subscription_renewal_failed: {
      subject: "Error de renovación de MoaVoca Premium",
      heading: "Problema de pago",
      body: "No pudimos renovar tu suscripción a MoaVoca Premium. Suele deberse a información de pago vencida o saldo insuficiente. Actualiza tu método de pago en la configuración de App Store o Google Play para mantener Premium.",
      buttonText: "",
      footer: "Tu suscripción terminará si no se resuelve en unos días.",
    },
  },
  fr: {
    subscription_welcome: {
      subject: "Bienvenue dans MoaVoca Premium",
      heading: "Premium activé",
      body: "Merci pour votre abonnement à MoaVoca Premium. Toutes les fonctionnalités sont débloquées : révisions illimitées, sans publicité, recherche par image, export PDF et listes illimitées.",
      buttonText: "",
      footer: "Des questions ? Répondez à cet e-mail ou visitez moavoca.com.",
    },
    trial_ending_soon: {
      subject: "Votre essai MoaVoca Premium se termine dans 2 jours",
      heading: "Essai bientôt terminé",
      body: "Votre essai gratuit de 7 jours de MoaVoca Premium se termine dans 2 jours. Après cela, votre abonnement sera facturé. Annulez à tout moment dans les paramètres de votre compte App Store ou Google Play pour éviter le débit.",
      buttonText: "",
      footer: "Vous aimez Premium ? Aucune action requise — votre abonnement continue automatiquement.",
    },
    subscription_cancelled: {
      subject: "Votre abonnement MoaVoca Premium a été annulé",
      heading: "Abonnement annulé",
      body: "Votre abonnement MoaVoca Premium a été annulé. Vous aurez accès aux fonctionnalités Premium jusqu'à la fin de votre période de facturation actuelle. Vous pouvez vous réabonner à tout moment depuis l'application.",
      buttonText: "",
      footer: "Des commentaires ? Nous aimerions savoir pourquoi vous avez annulé. Répondez à cet e-mail.",
    },
    subscription_renewal_failed: {
      subject: "Échec du renouvellement MoaVoca Premium",
      heading: "Problème de paiement",
      body: "Nous n'avons pas pu renouveler votre abonnement MoaVoca Premium. Cela est généralement dû à des informations de paiement expirées ou à un solde insuffisant. Mettez à jour votre mode de paiement dans les paramètres App Store ou Google Play pour conserver Premium.",
      buttonText: "",
      footer: "Votre abonnement prendra fin si le problème n'est pas résolu dans quelques jours.",
    },
  },
  de: {
    subscription_welcome: {
      subject: "Willkommen bei MoaVoca Premium",
      heading: "Premium aktiviert",
      body: "Vielen Dank für dein MoaVoca Premium-Abo. Alle Funktionen sind freigeschaltet: unbegrenzte Wiederholungen, werbefrei, Bildsuche, PDF-Export und unbegrenzte Wortlisten.",
      buttonText: "",
      footer: "Fragen? Antworte auf diese E-Mail oder besuche moavoca.com.",
    },
    trial_ending_soon: {
      subject: "Deine MoaVoca Premium-Testphase endet in 2 Tagen",
      heading: "Testphase endet bald",
      body: "Deine 7-tägige Gratistestphase von MoaVoca Premium endet in 2 Tagen. Danach wird dein Abo abgerechnet. Du kannst jederzeit in den App Store- oder Google Play-Kontoeinstellungen kündigen, um die Abrechnung zu vermeiden.",
      buttonText: "",
      footer: "Premium gefällt dir? Keine Aktion nötig — dein Abo wird automatisch fortgesetzt.",
    },
    subscription_cancelled: {
      subject: "Dein MoaVoca Premium-Abo wurde gekündigt",
      heading: "Abo gekündigt",
      body: "Dein MoaVoca Premium-Abo wurde gekündigt. Du hast bis zum Ende des aktuellen Abrechnungszeitraums Zugriff auf alle Premium-Funktionen. Du kannst jederzeit über die App erneut abonnieren.",
      buttonText: "",
      footer: "Feedback? Wir würden gerne wissen, warum du gekündigt hast. Antworte auf diese E-Mail.",
    },
    subscription_renewal_failed: {
      subject: "MoaVoca Premium-Verlängerung fehlgeschlagen",
      heading: "Zahlungsproblem",
      body: "Wir konnten dein MoaVoca Premium-Abo nicht verlängern. Normalerweise liegt es an abgelaufenen oder unzureichenden Zahlungsinformationen. Aktualisiere deine Zahlungsmethode in den App Store- oder Google Play-Kontoeinstellungen, um Premium zu behalten.",
      buttonText: "",
      footer: "Dein Abo endet, wenn das Problem nicht innerhalb weniger Tage gelöst wird.",
    },
  },
  it: {
    subscription_welcome: {
      subject: "Benvenuto in MoaVoca Premium",
      heading: "Premium attivato",
      body: "Grazie per l'abbonamento a MoaVoca Premium. Tutte le funzioni sono sbloccate: ripassi illimitati, senza pubblicità, ricerca di parole tramite immagine, esportazione PDF e liste illimitate.",
      buttonText: "",
      footer: "Hai domande? Rispondi a questa email o visita moavoca.com.",
    },
    trial_ending_soon: {
      subject: "La tua prova MoaVoca Premium termina tra 2 giorni",
      heading: "La prova sta per finire",
      body: "La tua prova gratuita di 7 giorni di MoaVoca Premium termina tra 2 giorni. Dopodiché ti verrà addebitato l'abbonamento. Annulla in qualsiasi momento dalle impostazioni del tuo account App Store o Google Play per evitare l'addebito.",
      buttonText: "",
      footer: "Ti piace Premium? Nessuna azione necessaria — il tuo abbonamento continua automaticamente.",
    },
    subscription_cancelled: {
      subject: "Il tuo abbonamento MoaVoca Premium è stato annullato",
      heading: "Abbonamento annullato",
      body: "Il tuo abbonamento MoaVoca Premium è stato annullato. Avrai accesso alle funzioni Premium fino alla fine dell'attuale periodo di fatturazione. Puoi riabbonarti in qualsiasi momento dall'app.",
      buttonText: "",
      footer: "Hai commenti? Ci piacerebbe sapere perché hai annullato. Rispondi a questa email.",
    },
    subscription_renewal_failed: {
      subject: "Rinnovo MoaVoca Premium non riuscito",
      heading: "Problema di pagamento",
      body: "Non siamo riusciti a rinnovare il tuo abbonamento MoaVoca Premium. Di solito è dovuto a informazioni di pagamento scadute o saldo insufficiente. Aggiorna il metodo di pagamento nelle impostazioni del tuo account App Store o Google Play per mantenere Premium.",
      buttonText: "",
      footer: "Il tuo abbonamento terminerà se non risolto entro pochi giorni.",
    },
  },
};

export function getSubscriptionEmailTranslation(
  lang: string,
  type: SubscriptionEmailType,
): EmailStrings {
  const locale = s[lang] || s[lang.split("-")[0]] || s["en"];
  return locale[type] || locale["subscription_welcome"];
}
