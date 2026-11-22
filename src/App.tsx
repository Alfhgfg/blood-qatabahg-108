import React, { useState, useEffect, useCallback } from 'react';
import { Droplet, Loader2, Lock } from 'lucide-react';
import { 
  ActivePage, 
  BloodRequest, 
  BloodType, 
  District, 
  Donor, 
  AppNotification, 
  UserRole,
  RequestStatus,
  UserAccount,
  HospitalAd,
  UpdateCheckResult,
  UpdateProgressState
} from './types';
import { storageService } from './services/storageService';
import { firestoreService } from './firebase/firestoreService';
import { pushNotificationService } from './services/pushNotificationService';
import {
  appUpdateService,
  clearSnoozedVersion,
  isVersionSnoozedForSession,
  snoozeVersionForSession
} from './services/appUpdateService';
import { saveAndShareFile } from './services/nativeFileSaver';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { SidebarDrawer } from './components/SidebarDrawer';
import { AddDonorModal } from './components/AddDonorModal';
import { AddRequestModal } from './components/AddRequestModal';
import { DonorProfileModal } from './components/DonorProfileModal';
import { RequestDetailsModal } from './components/RequestDetailsModal';
import { NotificationModal } from './components/NotificationModal';
import { RoleSwitcherModal } from './components/RoleSwitcherModal';
import { InstallAppModal } from './components/InstallAppModal';
import { ImportDonorsModal } from './components/ImportDonorsModal';
import { PushPromptModal } from './components/PushPromptModal';
import { AppUpdateModal } from './components/AppUpdateModal';
import { HomePage } from './pages/HomePage';
import { DonorsPage } from './pages/DonorsPage';
import { RequestsPage } from './pages/RequestsPage';
import { DonationInfoPage } from './pages/DonationInfoPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { DistrictsPage } from './pages/DistrictsPage';
import { ProfilePage } from './pages/ProfilePage';
import { DonationHistoryPage } from './pages/DonationHistoryPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { HospitalAdDetailPage } from './pages/HospitalAdDetailPage';

// Offline Audio Chime using Web Audio API
function playAlertChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.15); // A5
    gain2.gain.setValueAtTime(0.2, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.5);
  } catch {
    // Ignore audio permission restrictions
  }
}

export default function App() {
  // Navigation, User & Role State with permanent persistence
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => storageService.getCurrentUser());
  const [role, setRole] = useState<UserRole>(() => storageService.getRole());
  const [isAuthReady, setIsAuthReady] = useState<boolean>(() => {
    // If local storage already has valid user session, we can start immediately
    return Boolean(storageService.getCurrentUser());
  });
  const [isLoadingDonors, setIsLoadingDonors] = useState<boolean>(false);
  const [donorLoadError, setDonorLoadError] = useState<string | null>(null);
  const [isAdminLoginView, setIsAdminLoginView] = useState<boolean>(false);
  const [activePage, setActivePage] = useState<ActivePage>(() => {
    try {
      const saved = localStorage.getItem('qaatabah_blood_last_page_v1') as ActivePage | null;
      const user = storageService.getCurrentUser();
      const validPages: ActivePage[] = [
        'home',
        'donors',
        'requests',
        'info',
        'admin',
        'districts',
        'profile',
        'history',
        'about',
        'contact',
        'settings',
        'hospital-ad'
      ];
      if (saved && validPages.includes(saved)) {
        if (saved === 'admin' && user?.role !== 'admin') {
          return 'home';
        }
        return saved;
      }
      return user?.role === 'admin' ? 'admin' : 'home';
    } catch {
      return 'home';
    }
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navigateToPage = (page: ActivePage) => {
    setActivePage(page);
    try {
      localStorage.setItem('qaatabah_blood_last_page_v1', page);
    } catch {}
  };

  // Core Data loaded from offline storage
  const [donors, setDonors] = useState<Donor[]>([]);
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [hospitalAds, setHospitalAds] = useState<HospitalAd[]>([]);
  const [selectedHospitalAd, setSelectedHospitalAd] = useState<HospitalAd | null>(null);
  const [selectedHospitalAdId, setSelectedHospitalAdId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('qaatabah_selected_hospital_ad_id_v1');
    } catch {
      return null;
    }
  });

  const handleSelectHospitalAd = (ad: HospitalAd) => {
    setSelectedHospitalAd(ad);
    setSelectedHospitalAdId(ad.id);
    try {
      localStorage.setItem('qaatabah_selected_hospital_ad_id_v1', ad.id);
    } catch {}
    navigateToPage('hospital-ad');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Centralized Donor Refresh Directly from Firebase Firestore
  const refreshDonors = useCallback(async () => {
    setIsLoadingDonors(true);
    setDonorLoadError(null);
    try {
      const freshDonors = await firestoreService.fetchDonors();
      if (Array.isArray(freshDonors) && freshDonors.length > 0) {
        setDonors(freshDonors);
        storageService.setLocalDonors(freshDonors);
      }
    } catch (err: any) {
      console.warn('refreshDonors warning:', err);
      setDonorLoadError('تعذر جلب بيانات المتبرعين من قاعدة البيانات السحابية. يرجى التحقق من اتصال الإنترنت.');
    } finally {
      setIsLoadingDonors(false);
    }
  }, []);

  // Modals
  const [isAddDonorOpen, setIsAddDonorOpen] = useState(false);
  const [donorToEdit, setDonorToEdit] = useState<Donor | null>(null);
  const [isAddRequestOpen, setIsAddRequestOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPushPromptOpen, setIsPushPromptOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Selected details
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<BloodRequest | null>(null);

  // Shared blood filter
  const [selectedBloodFilter, setSelectedBloodFilter] = useState<BloodType | null>(null);

  // Toast alert
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // In-App Update System State
  const [updateCheckResult, setUpdateCheckResult] = useState<UpdateCheckResult | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateProgressState, setUpdateProgressState] = useState<UpdateProgressState>({
    phase: 'idle',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0
  });

  const runAppUpdateCheck = useCallback(async (manual = false, swWaitingReady = false) => {
    try {
      const result = await appUpdateService.checkForUpdates({ swWaitingReady });
      setUpdateCheckResult(result);

      const targetVersionCode =
        result.platform === 'android'
          ? result.remoteConfig?.android?.versionCode || 0
          : result.remoteConfig?.web?.versionCode || 0;
      const isMandatory =
        result.platform === 'android'
          ? Boolean(result.remoteConfig?.android?.mandatory)
          : Boolean(result.remoteConfig?.web?.mandatory);

      if (result.updateAvailable) {
        if (manual || isMandatory || !isVersionSnoozedForSession(targetVersionCode)) {
          setUpdateProgressState({
            phase: 'available',
            progress: 0,
            downloadedBytes: 0,
            totalBytes: result.remoteConfig?.android?.fileSize || 0
          });
          setIsUpdateModalOpen(true);
        }
      } else if (manual) {
        if (!result.compatible && result.compatibility.reasonMessage) {
          setUpdateProgressState({
            phase: 'available',
            progress: 0,
            downloadedBytes: 0,
            totalBytes: 0
          });
          setIsUpdateModalOpen(true);
        } else {
          setToastMessage(`أنت تستخدم أحدث إصدار من التطبيق (v${result.installed.versionName}) ✅`);
          setTimeout(() => setToastMessage(null), 3500);
        }
      }
    } catch {
      if (manual) {
        setToastMessage('تعذر التحقق من التحديثات حالياً. يرجى التأكد من اتصال الإنترنت.');
        setTimeout(() => setToastMessage(null), 3500);
      }
    }
  }, []);

  const handleStartAppUpdate = useCallback(async () => {
    if (!updateCheckResult) return;
    clearSnoozedVersion();
    await appUpdateService.downloadAndInstallUpdate(updateCheckResult, setUpdateProgressState);
  }, [updateCheckResult]);

  const handleRetryInstallPermission = useCallback(async () => {
    await appUpdateService.retryInstallAfterPermission(setUpdateProgressState);
  }, []);

  const handleOpenInstallPermissionSettings = useCallback(async () => {
    await appUpdateService.openInstallPermissionSettings();
  }, []);

  const handleDismissUpdateLater = useCallback(() => {
    if (updateCheckResult) {
      const targetCode =
        updateCheckResult.platform === 'android'
          ? updateCheckResult.remoteConfig?.android?.versionCode || 0
          : updateCheckResult.remoteConfig?.web?.versionCode || 0;
      if (targetCode > 0) {
        snoozeVersionForSession(targetCode);
      }
    }
    setIsUpdateModalOpen(false);
  }, [updateCheckResult]);

  const handleCancelUpdateDownload = useCallback(async () => {
    await appUpdateService.cancelDownload();
    setUpdateProgressState({
      phase: 'available',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0
    });
  }, []);

  // Initialize data on mount, sync with server, and listen for PWA install prompt
  useEffect(() => {
    // 0. Auto-register device for FCM push notifications if permission is granted, or prompt if new
    try {
      setTimeout(() => {
        pushNotificationService.autoRegisterPushNotifications().catch(() => {});
      }, 600);
      if (pushNotificationService.isSupported()) {
        const currentPerm = pushNotificationService.getPermissionSync();
        const dismissed = localStorage.getItem('qaatabah_push_prompt_dismissed_v1');
        if (currentPerm === 'default' && !dismissed) {
          setTimeout(() => {
            setIsPushPromptOpen(true);
          }, 1500);
        }
      }
    } catch {}

    // 1. Initial fast load from local storage
    const localD = storageService.getDonors();
    if (localD.length > 0) setDonors(localD);
    setRequests(storageService.getRequests());
    setDistricts(storageService.getDistricts());
    setNotifications(storageService.getNotifications());
    const localAds = storageService.getLocalHospitalAds();
    if (localAds.length > 0) setHospitalAds(localAds);
    storageService.getHospitalAds().then((freshAds) => {
      if (Array.isArray(freshAds)) {
        setHospitalAds(freshAds);
      }
    }).catch(() => {});
    const savedUser = storageService.getCurrentUser();
    if (savedUser) {
      setCurrentUser(savedUser);
      setRole(savedUser.role);
      // Refresh user profile (including photoUrl and linkedDonorId) from Firestore
      if (savedUser.id) {
        firestoreService.fetchUserById(savedUser.id).then((remoteUser) => {
          if (remoteUser && remoteUser.id === savedUser.id) {
            const mergedUser = { ...savedUser, ...remoteUser };
            setCurrentUser(mergedUser);
            setRole(mergedUser.role);
            storageService.setCurrentUser(mergedUser);
          }
        }).catch(() => {});
      }
    } else {
      setRole(storageService.getRole());
    }

    // 2. Fetch fresh donors from Firestore immediately and seed if cloud database is empty
    firestoreService.seedInitialDataIfEmpty(
      localD,
      storageService.getRequests(),
      storageService.getDistricts(),
      storageService.getLocalUsers()
    ).then(() => {
      firestoreService.confirmMasterAdminInFirestore().catch(() => {});
      refreshDonors();
    }).catch(() => {
      firestoreService.confirmMasterAdminInFirestore().catch(() => {});
      refreshDonors();
    });

    // 3. Real-time live synchronization with Firebase Firestore
    const unsubscribeDonors = firestoreService.subscribeDonors(
      (liveDonors) => {
        if (Array.isArray(liveDonors)) {
          setDonors(liveDonors);
          storageService.setLocalDonors(liveDonors);
          setDonorLoadError(null);
          setIsLoadingDonors(false);
        }
      },
      (error) => {
        console.warn('Firestore live donors listener error:', error);
        setDonorLoadError('تعذر الاتصال بقاعدة بيانات المتبرعين السحابية');
        setIsLoadingDonors(false);
      }
    );

    let initialRequestsLoaded = false;
    const unsubscribeRequests = firestoreService.subscribeRequests((liveRequests) => {
      if (Array.isArray(liveRequests) && liveRequests.length > 0) {
        if (initialRequestsLoaded) {
          // Check for newly added open requests and trigger notification
          const currentIds = new Set(storageService.getRequests().map((r) => r.id));
          liveRequests.forEach((req) => {
            if (!currentIds.has(req.id) && req.status === 'open') {
              pushNotificationService.notifyForRequest(req);
            }
          });
        }
        initialRequestsLoaded = true;
        setRequests(liveRequests);
        storageService.setLocalRequests(liveRequests);
      }
    });

    const unsubscribeDistricts = firestoreService.subscribeDistricts((liveDistricts) => {
      if (Array.isArray(liveDistricts) && liveDistricts.length > 0) {
        setDistricts(liveDistricts);
        storageService.setLocalDistricts(liveDistricts);
      }
    });

    const unsubscribeNotifications = firestoreService.subscribeNotifications((liveNotifs) => {
      if (Array.isArray(liveNotifs) && liveNotifs.length > 0) {
        setNotifications(liveNotifs);
        storageService.setLocalNotifications(liveNotifs);
      }
    });

    const unsubscribeHospitalAds = firestoreService.subscribeHospitalAds((liveAds) => {
      if (Array.isArray(liveAds) && liveAds.length > 0) {
        setHospitalAds(liveAds);
        storageService.setLocalHospitalAds(liveAds);
      } else {
        storageService.getHospitalAds().then((merged) => {
          setHospitalAds(merged);
        }).catch(() => {});
      }
    });

    // 4. Persistent Firebase Auth state listener with automatic admin session restoration
    const unsubscribeAuth = firestoreService.subscribeAuthState(async (authUser) => {
      if (authUser) {
        setCurrentUser(authUser);
        setRole(authUser.role);
        storageService.setCurrentUser(authUser);
        storageService.setRole(authUser.role);

        // Pre-fetch and cache fresh admin ID token if administrator
        if (authUser.role === 'admin') {
          try {
            await storageService.getAdminAuthHeaders(false);
          } catch {}
        }
      }
      setIsAuthReady(true);
    });

    // Safety fallback: Ensure auth check resolves within 1.2s max
    const authTimer = setTimeout(() => {
      setIsAuthReady(true);
    }, 1200);

    // 5. Centralized background sync for server notifications and backups
    const sync = async () => {
      const serverData = await storageService.syncFromServer();
      if (serverData.online && serverData.notifications) {
        setNotifications(serverData.notifications);
      }
      if (serverData.online && Array.isArray(serverData.donors) && serverData.donors.length > 0) {
        setDonors((prev) => (prev.length === 0 ? serverData.donors : prev));
      }
    };
    sync();

    // 6. Periodic background sync every 45s
    const interval = setInterval(sync, 45000);

    // 7. Auto-detect internet reconnection and resync automatically
    const handleOnline = () => {
      setDonorLoadError(null);
      refreshDonors();
      storageService.syncFromServer();
      triggerToast('تمت استعادة الاتصال بالإنترنت ومزامنة البيانات تلقائياً 🟢');
    };

    const handleOffline = () => {
      triggerToast('أنت الآن في وضع عدم الاتصال (أوفلاين) 📶 السجل متاح ومحفوظ');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // 8. Check for app updates on startup & clean stale cached APKs without touching user data/session
    appUpdateService.cleanupNativeUpdateCache().catch(() => {});
    const startupUpdateTimer = setTimeout(() => {
      runAppUpdateCheck(false, false);
    }, 1800);
    const handleSwUpdateReady = () => {
      runAppUpdateCheck(false, true);
    };
    window.addEventListener('APP_SW_UPDATE_AVAILABLE', handleSwUpdateReady);

    return () => {
      unsubscribeDonors();
      unsubscribeRequests();
      unsubscribeDistricts();
      unsubscribeNotifications();
      unsubscribeHospitalAds();
      unsubscribeAuth();
      clearTimeout(authTimer);
      clearTimeout(startupUpdateTimer);
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('APP_SW_UPDATE_AVAILABLE', handleSwUpdateReady);
    };
  }, [refreshDonors, runAppUpdateCheck]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    playAlertChime();
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleUpdateUser = async (updatedUser: UserAccount) => {
    setCurrentUser(updatedUser);
    storageService.setCurrentUser(updatedUser);
    const localUsers = storageService.getLocalUsers();
    const nextUsers = localUsers.some((u) => u.id === updatedUser.id)
      ? localUsers.map((u) => (u.id === updatedUser.id ? updatedUser : u))
      : [...localUsers, updatedUser];
    storageService.saveLocalUsers(nextUsers);
    await firestoreService.setUser(updatedUser);
  };

  const handleLogout = () => {
    setIsSidebarOpen(false);
    storageService.logout();
    setCurrentUser(null);
    setRole('user');
    navigateToPage('home');
    triggerToast('تم تسجيل الخروج بنجاح 👋');
  };

  // Deep link detection from push notification clicks (URL query param ?openRequest=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const reqId = params.get('openRequest');
      if (reqId) {
        const targetReq = requests.find((r) => r.id === reqId) || storageService.getRequests().find((r) => r.id === reqId);
        if (targetReq) {
          setSelectedRequest(targetReq);
          setActivePage('requests');
          // Clean query params from URL without page reload
          const url = new URL(window.location.href);
          url.searchParams.delete('openRequest');
          window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
        } else {
          firestoreService.fetchRequests().then((fresh) => {
            const found = fresh.find((r) => r.id === reqId);
            if (found) {
              setSelectedRequest(found);
              setActivePage('requests');
              const url = new URL(window.location.href);
              url.searchParams.delete('openRequest');
              window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
            }
          }).catch(() => {});
        }
      }
    } catch {}
  }, [requests]);

  // Service Worker message listener for OPEN_REQUEST_NOTIFICATION
  useEffect(() => {
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'OPEN_REQUEST_NOTIFICATION' && event.data.requestId) {
        const reqId = event.data.requestId;
        const targetReq = requests.find((r) => r.id === reqId) || storageService.getRequests().find((r) => r.id === reqId);
        if (targetReq) {
          setSelectedRequest(targetReq);
          setActivePage('requests');
        } else {
          firestoreService.fetchRequests().then((fresh) => {
            const found = fresh.find((r) => r.id === reqId);
            if (found) {
              setSelectedRequest(found);
              setActivePage('requests');
            }
          }).catch(() => {});
        }
      }
    };

    const handlePushEvent = (e: any) => {
      const detail = e.detail;
      const title = detail?.title || '🚨 نداء دم عاجل';
      const body = detail?.body || '';
      triggerToast(`${title}: ${body}`);
    };

    const handleOpenReqEvent = (e: any) => {
      const reqId = e.detail?.requestId;
      if (reqId) {
        const targetReq = requests.find((r) => r.id === reqId) || storageService.getRequests().find((r) => r.id === reqId);
        if (targetReq) {
          setSelectedRequest(targetReq);
          setActivePage('requests');
        } else {
          firestoreService.fetchRequests().then((fresh) => {
            const found = fresh.find((r) => r.id === reqId);
            if (found) {
              setSelectedRequest(found);
              setActivePage('requests');
            }
          }).catch(() => {});
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }
    window.addEventListener('PUSH_NOTIFICATION_RECEIVED', handlePushEvent);
    window.addEventListener('OPEN_REQUEST_NOTIFICATION', handleOpenReqEvent);

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
      window.removeEventListener('PUSH_NOTIFICATION_RECEIVED', handlePushEvent);
      window.removeEventListener('OPEN_REQUEST_NOTIFICATION', handleOpenReqEvent);
    };
  }, [requests]);

  // Donor Handlers
  const handleOpenAddDonor = () => {
    setDonorToEdit(null);
    setIsAddDonorOpen(true);
  };

  const handleSaveDonor = async (donorData: Omit<Donor, 'id' | 'createdAt'>) => {
    try {
      const created = await storageService.saveDonor(donorData, currentUser);
      setDonors(storageService.getDonors());
      setNotifications(storageService.getNotifications());
      setCurrentUser(storageService.getCurrentUser());
      triggerToast(`تم حفظ المتبرع ${created.fullName} (${created.bloodType}) بنجاح في قاعدة البيانات ✅`);
    } catch (err: any) {
      triggerToast(err.message || 'تعذر حفظ بيانات المتبرع');
      throw err;
    }
  };

  const handleOpenEditDonor = (donor: Donor) => {
    setDonorToEdit(donor);
    setIsAddDonorOpen(true);
  };

  const handleUpdateDonor = async (updated: Donor) => {
    try {
      await storageService.updateDonor(updated);
      setDonors(storageService.getDonors());
      if (selectedDonor?.id === updated.id) {
        setSelectedDonor(updated);
      }
      triggerToast(`تم تحديث بيانات المتبرع ${updated.fullName} بنجاح في قاعدة البيانات ✅`);
    } catch (err: any) {
      triggerToast(err.message || 'تعذر تحديث بيانات المتبرع');
      throw err;
    }
  };

  const handleToggleDonorAvailability = async (donor: Donor) => {
    const updated: Donor = {
      ...donor,
      isAvailable: !donor.isAvailable
    };
    try {
      await storageService.updateDonor(updated);
      setDonors(storageService.getDonors());
      if (selectedDonor?.id === donor.id) {
        setSelectedDonor(updated);
      }
      triggerToast(`تم تحديث حالة التوفر للمتبرع ${donor.fullName} بنجاح ✅`);
    } catch (err: any) {
      triggerToast(err.message || 'تعذر تحديث حالة المتبرع');
    }
  };

  const handleDeleteDonor = async (id: string) => {
    if (role !== 'admin') {
      triggerToast('عفواً، حذف المتبرع متاح للمسؤول فقط ⚠️');
      return;
    }
    try {
      await storageService.deleteDonor(id);
      setDonors(storageService.getDonors());
      if (selectedDonor?.id === id) {
        setSelectedDonor(null);
      }
      triggerToast('تم حذف المتبرع من قاعدة البيانات المركزية بنجاح 🗑️');
    } catch (err: any) {
      triggerToast(err.message || 'تعذر حذف المتبرع من قاعدة البيانات');
    }
  };

  const handleDeleteAllDonors = async () => {
    if (role !== 'admin') {
      triggerToast('عفواً، حذف جميع المتبرعين متاح للمسؤول فقط ⚠️');
      return;
    }
    try {
      setIsLoadingDonors(true);
      await storageService.deleteAllDonors();
      setDonors([]);
      setSelectedDonor(null);
      triggerToast('تم حذف جميع المتبرعين نهائياً من قاعدة البيانات السحابية المركزية 🗑️');
    } catch (err: any) {
      triggerToast(err.message || 'تعذر حذف المتبرعين من قاعدة البيانات');
    } finally {
      setIsLoadingDonors(false);
    }
  };

  // Request Handlers
  const handleSaveRequest = async (reqData: Omit<BloodRequest, 'id' | 'createdAt'>) => {
    try {
      const created = await storageService.saveRequest(reqData);
      setRequests(storageService.getRequests());
      setNotifications(storageService.getNotifications());
      // Trigger instant push notification evaluation & external dispatch
      pushNotificationService.notifyForRequest(created);
      pushNotificationService.broadcastEmergencyRequest(created);
      triggerToast(`تم حفظ ونشر طلب الدم للمريض ${created.patientName} (${created.bloodType}) في قاعدة البيانات بنجاح ✅`);
    } catch (err: any) {
      triggerToast(err.message || 'تعذر نشر طلب الدم في قاعدة البيانات');
      throw err;
    }
  };

  const handleUpdateRequestStatus = async (req: BloodRequest, status: RequestStatus) => {
    const updated: BloodRequest = {
      ...req,
      status
    };
    await storageService.updateRequest(updated);
    setRequests(storageService.getRequests());
    if (selectedRequest?.id === req.id) {
      setSelectedRequest(updated);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (role !== 'admin') {
      triggerToast('عفواً، حذف طلب الدم متاح للمسؤول فقط ⚠️');
      return;
    }
    try {
      await storageService.deleteRequest(id);
      setRequests(storageService.getRequests());
      if (selectedRequest?.id === id) {
        setSelectedRequest(null);
      }
      triggerToast('تم حذف طلب الدم من قاعدة البيانات بنجاح 🗑️');
    } catch (err: any) {
      triggerToast(err.message || 'تعذر حذف طلب الدم');
    }
  };

  // District Handlers
  const handleAddDistrict = async (name: string, areas: string[]) => {
    await storageService.saveDistrict(name, areas);
    setDistricts(storageService.getDistricts());
    triggerToast(`تمت إضافة مديرية ${name} بنجاح`);
  };

  const handleUpdateDistrict = async (district: District) => {
    await storageService.updateDistrict(district);
    setDistricts(storageService.getDistricts());
  };

  const handleDeleteDistrict = async (id: string) => {
    await storageService.deleteDistrict(id);
    setDistricts(storageService.getDistricts());
  };

  // Role Switcher
  const handleSelectRole = (newRole: UserRole) => {
    if (newRole === 'admin') {
      if (currentUser?.role === 'admin') {
        storageService.setRole('admin');
        setRole('admin');
        triggerToast('تم التبديل إلى دور المسؤول 🛡️');
      } else {
        navigateToPage('admin');
        triggerToast('يرجى تسجيل الدخول كمسؤول للمتابعة 🛡️');
      }
      return;
    }
    storageService.setRole('user');
    setRole('user');
    triggerToast('تم التبديل إلى دور المستخدم 👤');
  };

  // Backup & Restore
  const handleExportBackup = async () => {
    try {
      const jsonStr = storageService.exportBackup();
      const filename = `qaatabah_blood_registry_${new Date().toISOString().split('T')[0]}.json`;
      const res = await saveAndShareFile({
        filename,
        data: jsonStr,
        mimeType: 'application/json',
        title: 'النسخة الاحتياطية لسجل متبرعي الدم - قعطبة',
        text: `النسخة الاحتياطية لقاعدة بيانات متبرعي الدم (${filename})`,
        dialogTitle: 'تصدير ومشاركة النسخة الاحتياطية'
      });
      if (res.success) {
        triggerToast('تم تصدير وحفظ النسخة الاحتياطية بنجاح 💾');
      } else {
        triggerToast('تعذر تصدير النسخة الاحتياطية');
      }
    } catch (e: any) {
      triggerToast('حدث خطأ أثناء تصدير النسخة الاحتياطية');
    }
  };

  const handleImportBackup = async (fileContent: string) => {
    const success = await storageService.importBackup(fileContent);
    if (success) {
      setDonors(storageService.getDonors());
      setRequests(storageService.getRequests());
      setDistricts(storageService.getDistricts());
      triggerToast('تم استيراد البيانات بنجاح واستعادة السجلات');
    } else {
      alert('خطأ في صيغة ملف JSON المستورد');
    }
  };

  const handleImportDonors = async (newDonors: Omit<Donor, 'id' | 'createdAt'>[]) => {
    const res = await storageService.importDonors(newDonors);
    setDonors(storageService.getDonors());
    setNotifications(storageService.getNotifications());
    triggerToast(res.message || 'تم استيراد المتبرعين بنجاح ✅');
    return res;
  };

  const handleResetDefaults = () => {
    storageService.resetDefaults();
    setDonors(storageService.getDonors());
    setRequests(storageService.getRequests());
    setDistricts(storageService.getDistricts());
    setNotifications(storageService.getNotifications());
    triggerToast('تمت استعادة البيانات الافتراضية لقعطبة بنجاح');
  };

  // Deep linking from notification
  const handleNavigateToItem = (page: ActivePage, itemId?: string) => {
    navigateToPage(page);
    if (page === 'requests' && itemId) {
      const found = requests.find((r) => r.id === itemId);
      if (found) setSelectedRequest(found);
    } else if (page === 'donors' && itemId) {
      const found = donors.find((d) => d.id === itemId);
      if (found) setSelectedDonor(found);
    }
  };

  const urgentRequestsCount = requests.filter(
    (r) => r.status === 'open' && (r.urgency === 'critical' || r.urgency === 'urgent')
  ).length;

  // If authentication check is still in progress, show clean splash screen
  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white font-['Cairo',sans-serif]">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-rose-700 to-red-600 flex items-center justify-center shadow-2xl shadow-rose-900/50 mb-4 animate-pulse">
          <Droplet className="w-8 h-8 text-white fill-white" />
        </div>
        <h1 className="text-xl font-black tracking-tight text-white mb-1">
          سجل المتبرعين بالدم
        </h1>
        <p className="text-xs text-rose-300 font-semibold mb-1">
          مديرية قعطبة – محافظة الضالع
        </p>
        <p className="text-[11px] text-amber-200/90 font-semibold mb-6">
          برعاية اللجنة المجتمعية – مديرية قعطبة
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 text-rose-500 animate-spin" />
          <span>جاري التحقق من الجلسة وتحميل السجل السحابي...</span>
        </div>
      </div>
    );
  }

  // If not logged in, enforce login page as the mandatory first view
  if (!currentUser) {
    if (isAdminLoginView) {
      return (
        <AdminLoginPage
          onLoginSuccess={(adminUser) => {
            storageService.setCurrentUser(adminUser);
            setCurrentUser(adminUser);
            setRole(adminUser.role);
            setIsAdminLoginView(false);
            navigateToPage('admin');
            refreshDonors();
            triggerToast('مرحباً بك في لوحة تحكم المسؤول 🛡️');
          }}
          onBackToApp={() => setIsAdminLoginView(false)}
        />
      );
    }

    return (
      <LoginPage
        onLoginSuccess={(user) => {
          storageService.setCurrentUser(user);
          setCurrentUser(user);
          setRole(user.role);
          const targetPage: ActivePage = user.role === 'admin' ? 'admin' : 'home';
          navigateToPage(targetPage);
          refreshDonors();
          triggerToast(`مرحباً بك، ${user.fullName} 👋`);
        }}
        onGoToAdminLogin={() => setIsAdminLoginView(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 text-slate-800 flex flex-col font-['Cairo',sans-serif]">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-md text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4 border border-slate-700/50">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Header */}
      <Header
        role={role}
        onOpenRoleModal={() => setIsRoleModalOpen(true)}
        notifications={notifications}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onNavigateHome={() => navigateToPage('home')}
        onOpenInstallModal={() => setIsInstallModalOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        isSidebarOpen={isSidebarOpen}
      />

      {/* RTL Right-Side Navigation Sidebar Drawer */}
      <SidebarDrawer
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activePage={activePage}
        onNavigate={(p) => navigateToPage(p)}
        onOpenAddDonor={handleOpenAddDonor}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onLogout={handleLogout}
        currentUser={currentUser}
        role={role}
        donors={donors}
        openRequestsCount={requests.filter((r) => r.status === 'open').length}
        unreadNotificationsCount={notifications.filter((n) => !n.read).length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pt-5">
        {activePage === 'home' && (
          <HomePage
            donors={donors}
            requests={requests}
            hospitalAds={hospitalAds}
            onNavigate={(p) => navigateToPage(p)}
            onOpenAddDonor={handleOpenAddDonor}
            onOpenAddRequest={() => setIsAddRequestOpen(true)}
            onSelectDonor={(d) => setSelectedDonor(d)}
            onSelectRequest={(r) => setSelectedRequest(r)}
            onSelectHospitalAd={handleSelectHospitalAd}
            onFilterBloodType={(t) => setSelectedBloodFilter(t)}
            selectedBloodType={selectedBloodFilter}
            onOpenInstallModal={() => setIsInstallModalOpen(true)}
            onOpenNotifications={() => setIsNotificationsOpen(true)}
            role={role}
          />
        )}

        {activePage === 'hospital-ad' && (
          <HospitalAdDetailPage
            ad={
              (selectedHospitalAd && hospitalAds.find((item) => item.id === selectedHospitalAd.id)) ||
              selectedHospitalAd ||
              (selectedHospitalAdId ? hospitalAds.find((item) => item.id === selectedHospitalAdId) || null : null)
            }
            onBack={() => {
              navigateToPage('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onTriggerToast={triggerToast}
          />
        )}

        {activePage === 'donors' && (
          <DonorsPage
            donors={donors}
            districts={districts}
            onOpenAddDonor={handleOpenAddDonor}
            onSelectDonor={(d) => setSelectedDonor(d)}
            onEditDonor={handleOpenEditDonor}
            initialBloodFilter={selectedBloodFilter}
            role={role}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onRefreshDonors={refreshDonors}
            isLoadingDonors={isLoadingDonors}
            donorLoadError={donorLoadError}
          />
        )}

        {activePage === 'requests' && (
          <RequestsPage
            requests={requests}
            onOpenAddRequest={() => setIsAddRequestOpen(true)}
            onSelectRequest={(r) => setSelectedRequest(r)}
          />
        )}

        {activePage === 'info' && <DonationInfoPage />}

        {activePage === 'admin' && (
          role === 'admin' ? (
            <AdminDashboardPage
              role={role}
              donors={donors}
              requests={requests}
              onNavigate={(p) => navigateToPage(p)}
              onOpenRoleModal={() => setIsRoleModalOpen(true)}
              onEditDonor={handleOpenEditDonor}
              onDeleteDonor={handleDeleteDonor}
              onDeleteAllDonors={handleDeleteAllDonors}
              onOpenAddDonor={handleOpenAddDonor}
              onToggleDonorAvailability={handleToggleDonorAvailability}
              onUpdateRequestStatus={handleUpdateRequestStatus}
              onDeleteRequest={handleDeleteRequest}
              onExportBackup={handleExportBackup}
              onImportBackup={handleImportBackup}
              onResetDefaults={handleResetDefaults}
              onSelectDonor={(d) => setSelectedDonor(d)}
              onSelectRequest={(r) => setSelectedRequest(r)}
              onOpenImportModal={() => setIsImportModalOpen(true)}
              onLogout={handleLogout}
              currentUser={currentUser}
              hospitalAds={hospitalAds}
              onHospitalAdsChange={(updatedAds) => setHospitalAds(updatedAds)}
            />
          ) : (
            <div className="py-4">
              <AdminLoginPage
                onLoginSuccess={(adminUser) => {
                  storageService.setCurrentUser(adminUser);
                  setCurrentUser(adminUser);
                  setRole('admin');
                  refreshDonors();
                  triggerToast('تم التحقق وتسجيل الدخول كمسؤول بنجاح 🛡️');
                }}
                onBackToApp={() => navigateToPage('home')}
              />
            </div>
          )
        )}

        {activePage === 'districts' && (
          <DistrictsPage
            role={role}
            districts={districts}
            donors={donors}
            onNavigate={(p) => navigateToPage(p)}
            onOpenRoleModal={() => setIsRoleModalOpen(true)}
            onAddDistrict={handleAddDistrict}
            onUpdateDistrict={handleUpdateDistrict}
            onDeleteDistrict={handleDeleteDistrict}
          />
        )}

        {activePage === 'profile' && (
          <ProfilePage
            currentUser={currentUser}
            donors={donors}
            requests={requests}
            role={role}
            onUpdateUser={handleUpdateUser}
            onToggleDonorAvailability={handleToggleDonorAvailability}
            onOpenAddDonor={handleOpenAddDonor}
            onEditDonor={handleOpenEditDonor}
            onNavigate={(p) => navigateToPage(p)}
            onTriggerToast={triggerToast}
          />
        )}

        {activePage === 'history' && (
          <DonationHistoryPage
            currentUser={currentUser}
            donors={donors}
            requests={requests}
            onUpdateUser={handleUpdateUser}
            onSelectRequest={(r) => setSelectedRequest(r)}
            onSelectDonor={(d) => setSelectedDonor(d)}
            onOpenAddDonor={handleOpenAddDonor}
            onTriggerToast={triggerToast}
          />
        )}

        {activePage === 'about' && (
          <AboutPage
            donors={donors}
            requests={requests}
            districts={districts}
            onNavigate={(p) => navigateToPage(p)}
          />
        )}

        {activePage === 'contact' && (
          <ContactPage
            currentUser={currentUser}
            onOpenAddRequest={() => setIsAddRequestOpen(true)}
            onTriggerToast={triggerToast}
          />
        )}

        {activePage === 'settings' && (
          <SettingsPage
            currentUser={currentUser}
            role={role}
            donors={donors}
            districts={districts}
            requests={requests}
            onToggleDonorAvailability={handleToggleDonorAvailability}
            onRefreshData={refreshDonors}
            onOpenInstallModal={() => setIsInstallModalOpen(true)}
            onOpenRoleModal={() => setIsRoleModalOpen(true)}
            onNavigate={(p) => navigateToPage(p)}
            onLogout={handleLogout}
            onTriggerToast={triggerToast}
            onCheckForUpdates={() => runAppUpdateCheck(true)}
          />
        )}

        {/* Footer with Official Sponsorship, Copyright & Discreet Admin Access */}
        <footer className="mt-12 mb-28 pt-6 pb-4 text-center border-t border-slate-200/80 space-y-1.5">
          <p className="text-xs sm:text-sm font-bold text-rose-800">
            معًا من أجل إنقاذ الأرواح... قطرة دم قد تصنع حياة.
          </p>
          <p className="text-xs font-semibold text-slate-600">
            برعاية اللجنة المجتمعية – مديرية قعطبة
          </p>
          <p className="text-xs text-slate-500 font-semibold tracking-wide flex items-center justify-center gap-1.5 pt-1">
            <span>© جميع الحقوق محفوظة للنسر وايب 2027.</span>
            {role !== 'admin' && (
              <button
                type="button"
                onClick={() => navigateToPage('admin')}
                className="opacity-25 hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-amber-600 cursor-pointer"
                title="بوابة إدارة النظام المحمية"
                aria-label="بوابة إدارة النظام المحمية"
              >
                <Lock className="w-3.5 h-3.5" />
              </button>
            )}
          </p>
        </footer>
      </main>

      {/* Bottom Navigation Bar */}
      <BottomNav
        activePage={activePage}
        onNavigate={(p) => {
          navigateToPage(p);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        role={role}
        urgentRequestsCount={urgentRequestsCount}
      />

      {/* Modals */}
      <AddDonorModal
        isOpen={isAddDonorOpen}
        onClose={() => {
          setIsAddDonorOpen(false);
          setDonorToEdit(null);
        }}
        onSave={handleSaveDonor}
        onUpdate={handleUpdateDonor}
        donorToEdit={donorToEdit}
        districts={districts}
        existingDonors={donors}
      />

      <AddRequestModal
        isOpen={isAddRequestOpen}
        onClose={() => setIsAddRequestOpen(false)}
        onSave={handleSaveRequest}
        districts={districts}
      />

      <DonorProfileModal
        donor={selectedDonor}
        onClose={() => setSelectedDonor(null)}
        role={role}
        onToggleAvailability={handleToggleDonorAvailability}
        onDeleteDonor={handleDeleteDonor}
        onEditDonor={handleOpenEditDonor}
      />

      <RequestDetailsModal
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
        role={role}
        donors={donors}
        currentUser={currentUser}
        onTriggerToast={triggerToast}
        onUpdateRequestStatus={handleUpdateRequestStatus}
        onDeleteRequest={handleDeleteRequest}
        onSelectDonor={(d) => setSelectedDonor(d)}
      />

      <NotificationModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        districts={districts}
        userBloodType={
          currentUser?.linkedDonorId
            ? donors.find((d) => d.id === currentUser.linkedDonorId)?.bloodType
            : undefined
        }
        onTriggerToast={triggerToast}
        onMarkAsRead={(id) => {
          storageService.markAsRead(id);
          setNotifications(storageService.getNotifications());
        }}
        onMarkAllAsRead={() => {
          storageService.markAllAsRead();
          setNotifications(storageService.getNotifications());
        }}
        onClearAll={() => {
          storageService.clearNotifications();
          setNotifications([]);
        }}
        onNavigateToItem={handleNavigateToItem}
      />

      <RoleSwitcherModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        currentRole={role}
        onSelectRole={handleSelectRole}
        onOpenAdminLoginPage={() => {
          setIsRoleModalOpen(false);
          navigateToPage('admin');
        }}
      />

      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        deferredPrompt={deferredPrompt}
        onInstallSuccess={() => triggerToast('تم تثبيت التطبيق بنجاح على جهازك 🎉')}
      />

      <ImportDonorsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingDonors={donors}
        districts={districts}
        onImport={handleImportDonors}
      />

      {/* Push Notification Activation Prompt (Only on App Open) */}
      <PushPromptModal
        isOpen={isPushPromptOpen}
        onClose={() => setIsPushPromptOpen(false)}
        districts={districts}
        userBloodType={
          currentUser?.linkedDonorId
            ? donors.find((d) => d.id === currentUser.linkedDonorId)?.bloodType
            : undefined
        }
        onTriggerToast={triggerToast}
      />

      {/* Seamless In-App Update Modal */}
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        checkResult={updateCheckResult}
        progressState={updateProgressState}
        onStartUpdate={handleStartAppUpdate}
        onRetryInstallPermission={handleRetryInstallPermission}
        onOpenInstallPermissionSettings={handleOpenInstallPermissionSettings}
        onDismissLater={handleDismissUpdateLater}
        onCancelDownload={handleCancelUpdateDownload}
      />
    </div>
  );
}
