const navLinks = Array.from(document.querySelectorAll(".nav a"));
const syncedVideos = Array.from(document.querySelectorAll("[data-sync-video]"));
const explicitSyncNames = Array.from(
  new Set(syncedVideos.map((video) => video.dataset.syncSet).filter(Boolean))
);
const explicitGroupedVideos = new Set();
const explicitVideoGroups = explicitSyncNames.map((name) => {
  const videos = syncedVideos.filter((video) => video.dataset.syncSet === name);
  videos.forEach((video) => explicitGroupedVideos.add(video));
  return videos;
});
const fallbackVideoGroups = Array.from(document.querySelectorAll(".flow-shot"))
  .map((shot) => Array.from(shot.querySelectorAll("[data-sync-video]")).filter((video) => !explicitGroupedVideos.has(video)))
  .filter((videos) => videos.length > 0);
const videoGroups = [...explicitVideoGroups, ...fallbackVideoGroups]
  .map((shot) => ({
    ready: false,
    sharedDuration: 0,
    startedAt: 0,
    lastRowTime: 0,
    videos: shot,
  }))
  .filter((group) => group.videos.length > 0);

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      navLinks.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === `#${id}`);
      });
    });
  },
  { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
);

function startSyncedVideos() {
  if (!syncedVideos.length) return;

  let rafId = 0;
  const videoToGroup = new Map();

  const primeVideo = (video) => {
    video.muted = true;
    video.playsInline = true;
    video.loop = false;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  };

  const seekGroup = (group, time) => {
    group.videos.forEach((video) => {
      const safeTime = Math.min(video.duration - 0.04, Math.max(0, time));
      video.currentTime = safeTime;
    });
  };

  const prepareGroups = () => {
    videoGroups.forEach((group) => {
      if (group.ready) return;

      const isReady = group.videos.every(
        (video) => Number.isFinite(video.duration) && video.duration > 0
      );
      if (!isReady) return;

      group.ready = true;
      group.sharedDuration = Math.min(...group.videos.map((video) => video.duration));
      group.startedAt = performance.now();
      group.lastRowTime = 0;

      group.videos.forEach((video) => {
        video.dataset.sharedDuration = String(group.sharedDuration);
        video.playbackRate = 1;
        videoToGroup.set(video, group);
        primeVideo(video);
      });
      seekGroup(group, 0);
    });
  };

  const sync = () => {
    prepareGroups();

    videoGroups.forEach((group) => {
      if (!group.ready || !group.sharedDuration) return;

      const rowTime = ((performance.now() - group.startedAt) / 1000) % group.sharedDuration;
      const wrapped = rowTime < group.lastRowTime;
      group.lastRowTime = rowTime;

      if (wrapped || rowTime < 0.12) {
        group.startedAt = performance.now();
        group.lastRowTime = 0;
        seekGroup(group, 0);
      } else {
        const times = group.videos.map((video) => video.currentTime);
        const drift = Math.max(...times) - Math.min(...times);

        if (drift > 0.35) {
          seekGroup(group, Math.min(...times));
        }
      }

      group.videos.forEach((video) => {
        if (video.paused || video.ended) {
          primeVideo(video);
        }
      });
    });

    rafId = window.setTimeout(sync, 300);
  };

  syncedVideos.forEach((video) => {
    video.addEventListener("ended", () => {
      const group = videoToGroup.get(video);
      if (!group) return;
      group.startedAt = performance.now();
      group.lastRowTime = 0;
      seekGroup(group, 0);
      group.videos.forEach(primeVideo);
    });

    video.addEventListener(
      "loadedmetadata",
      () => {
        prepareGroups();
        primeVideo(video);
      },
      { once: true }
    );
    primeVideo(video);
  });

  sync();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.clearTimeout(rafId);
      return;
    }
    sync();
  });
}

startSyncedVideos();

["overview", "visual-flow", "workflow", "prompt", "template"].forEach((id) => {
  const section = document.getElementById(id);
  if (section) observer.observe(section);
});
