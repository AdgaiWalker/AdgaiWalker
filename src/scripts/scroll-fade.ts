const revealElements = document.querySelectorAll('.reveal');

revealElements.forEach(el => el.classList.add('reveal-init'));

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        entry.target.classList.remove('reveal-init');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 }
);

revealElements.forEach(el => observer.observe(el));
