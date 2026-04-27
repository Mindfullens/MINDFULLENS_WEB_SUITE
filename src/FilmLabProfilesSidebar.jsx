export default function FilmLabProfilesSidebar({
  sidebarRef,
  categoryTabs,
  visibleFilms,
  activeFilmIndex,
  activeCategory,
  searchQuery,
  onActiveCategoryChange,
  onSearchQueryChange,
  onSelectFilm,
}) {
  return (
    <aside className="sidebar-left" ref={sidebarRef}>
      <div className="sb-header">
        <div className="sb-title">
          Profile filmowe <span className="sb-count">{visibleFilms.length} profili</span>
        </div>
        <div className="film-tabs">
          {categoryTabs.map((tab) => (
            <button
              key={tab.id}
              className={`film-tab${activeCategory === tab.id ? ' active' : ''}`}
              type="button"
              onClick={() => onActiveCategoryChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="film-search">
        <input
          id="filmSearchInput"
          name="filmSearchInput"
          type="text"
          placeholder="Szukaj profilu..."
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
        />
      </div>

      <div className="film-list">
        {visibleFilms.map(({ film, index: sourceIndex }) => (
          <button
            key={`${film.name}-${film.sub}-${sourceIndex}`}
            className={`film-item${sourceIndex === activeFilmIndex ? ' active' : ''}`}
            type="button"
            onClick={() => onSelectFilm(sourceIndex)}
          >
            <span className="film-swatch" style={{ background: film.swatchStyle || 'transparent' }} />
            <span>
              <span className="film-name">{film.name}</span>
              <span className="film-sub">{film.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="profiles-footer-note" aria-label="Informacja o renderze">
        <div className="profiles-footer-copy">© 2026 Mindfullens.</div>
      </div>
    </aside>
  );
}
