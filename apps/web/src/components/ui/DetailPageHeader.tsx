import type { ReactNode } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export type DetailPageBreadcrumb = {
  label: string;
  to?: string;
};

type DetailPageHeaderProps = {
  eyebrow?: string;
  title: string;
  backTo: string;
  backLabel: string;
  breadcrumbs: DetailPageBreadcrumb[];
  actions?: ReactNode;
};

export function DetailPageHeader({ eyebrow, title, backTo, backLabel, breadcrumbs, actions }: DetailPageHeaderProps) {
  return (
    <header className="detail-page-header">
      <div className="detail-page-header__top">
        <Link className="detail-page-back" to={backTo}>
          <ArrowLeft size={16} />
          <span>{backLabel}</span>
        </Link>
        <nav className="detail-page-breadcrumbs" aria-label="面包屑">
          <ol className="detail-page-breadcrumb-list">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <li className="detail-page-breadcrumb-item" key={`${crumb.label}-${index}`}>
                  {crumb.to && !isLast ? (
                    <Link className="detail-page-breadcrumb-link" to={crumb.to}>
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="detail-page-breadcrumb-current">{crumb.label}</span>
                  )}
                  {!isLast ? <ChevronRight className="detail-page-breadcrumb-separator" size={14} /> : null}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
      <div className="page-header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
        </div>
        {actions ? <div className="toolbar">{actions}</div> : null}
      </div>
    </header>
  );
}
