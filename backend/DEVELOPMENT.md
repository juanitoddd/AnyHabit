# Backend Development Guide

This guide explains the backend code structure and how to develop/extend the API.

## Project Structure

```
backend/
├── __pycache__/                 # Python cache (ignore)
├── data/                        # SQLite database (local dev only)
├── routers/                     # API endpoint definitions
│   ├── __init__.py
│   ├── auth.py                  # /auth endpoints (JWT, Login, Register)
│   ├── trackers.py              # /trackers endpoints
│   ├── logs.py                  # /logs endpoints
│   ├── journals.py              # /journal endpoints
│   ├── groups.py                # /groups endpoints (Multi-User)
│   ├── dashboard.py             # /dashboard endpoints
│   └── export.py                # /export endpoints (Data Export & Backup Import)
├── analytics.py                 # Business logic (calculations)
├── database.py                  # Database connection
├── deps.py                      # Dependency injection & Auth verification
├── main.py                      # Application entry point
├── migrations.py                # Database migrations
├── models.py                    # SQLAlchemy ORM models
├── schemas.py                   # Pydantic request/response schemas
├── security.py                  # Password hashing & JWT token generation
├── time_utils.py                # Date/time utilities
├── requirements.txt             # Python dependencies
├── Dockerfile                   # Container definition
├── README.md                    # API documentation
├── API_QUICK_REFERENCE.md       # Quick API cheat sheet
├── FRONTEND_INTEGRATION.md      # Frontend dev guide
└── INDEX.md                     # Documentation index
```

## Core Components

### 1. Database (database.py)

Manages SQLAlchemy ORM setup:

```python
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
```

- SQLite in dev, PostgreSQL recommended for production
- Connection pooling
- Session management

### 2. Models (models.py)

SQLAlchemy ORM definitions now support multi-user environments:

```python
class User(Base):
    """Represents an authenticated user"""
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True)
    hashed_password = Column(String)

class Tracker(Base):
    """Represents a habit/goal tracker"""
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)
    type = Column(String)  # "build", "quit", "boolean"
    # ... other fields
```

**Key Points:**
- Uses UTC-naive datetimes
- Foreign keys for relationships (every resource belongs to a `User` or `Group`)
- Cascade deletes on tracker deletion

### 3. Schemas (schemas.py)

Pydantic models for request/response validation:

```python
class Tracker(BaseModel):
    """Response schema for trackers"""
    id: int
    owner_id: int
    name: str
    type: str
    # ...

class TrackerCreate(BaseModel):
    """Request schema for creating trackers"""
    name: str
    type: str
    # ...
```

**Key Points:**
- Validates input data
- Converts database models to JSON
- Separates concerns (DB vs API)

### 4. Analytics (analytics.py)

Business logic and calculations:

```python
def build_tracker_analytics(tracker, logs, journals, current_user_id=None):
    """Compute all metrics for a tracker"""
    current_math = _calculate_current_math(tracker, logs)
    daily_progress = _calculate_daily_progress(tracker, logs)
    streaks = _calculate_streak_stats(tracker, logs, journals)
    # ... more calculations
    return TrackerAnalytics(...)
```

**Key Functions:**
- `period_start()` - Get start of a period
- `add_period()` - Move forward in time
- `shift_period()` - Move multiple periods
- `get_periods_between()` - Calculate duration
- `_calculate_current_math()` - Current progress
- `_calculate_daily_progress()` - Today's progress
- `_calculate_streak_stats()` - Streak counts
- `_build_historical_chart_data()` - 120-day history
- `build_dashboard_summary()` - Aggregate all trackers

### 5. Routers (routers/)

FastAPI endpoints organized by domain:

```python
@router.get("/trackers/")
def read_trackers(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Tracker).filter(models.Tracker.owner_id == current_user.id).all()
```

**Organization:**
- One file per resource (`auth.py`, `trackers.py`, `export.py`, etc.)
- Endpoints are protected via `Depends(get_current_user)`
- Error handling with HTTPException

### 6. Dependencies (deps.py)

Dependency injection & Security:

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    # Validates JWT token and returns User model
    pass
```

### 7. Application (main.py)

FastAPI app setup:

```python
app = FastAPI(title="AnyHabit API")

# CORS configuration
app.add_middleware(CORSMiddleware, ...)

# Routes
app.include_router(auth_router)
app.include_router(trackers_router)
app.include_router(export_router)
# ...
```

---

## Data Flow

### 1. Authentication Flow
```
1. Frontend sends: POST /auth/login { "identifier": "...", "password": "..." }
2. auth.py validates credentials against User table.
3. security.py generates a JWT token.
4. Token is attached to response as an HttpOnly cookie.
5. Subsequent requests pass through deps.get_current_user() for validation.
```

### 2. Creating a Tracker
```
1. Frontend sends: POST /trackers/ (with Auth Cookie)
2. FastAPI validates with TrackerCreate schema.
3. deps.py extracts current_user.
4. Route handler (routers/trackers.py) creates model and assigns owner_id = current_user.id.
5. JSON response sent to frontend.
```

### 3. Export & Backup Import Flow
```
1. Frontend sends: POST /export/import/ (Multipart File Upload)
2. export.py parses the JSON file.
3. Validates that it is a "Full Backup" (`export_type == "backup"`).
4. Loops through Trackers, Logs, Journals, and Groups:
   - Pops the old database `id` (to avoid auto-increment collisions).
   - Re-assigns the `owner_id` or `user_id` to the currently logged-in user.
   - Bulk inserts everything into the database.
5. UserDashboardState is overwritten for a clean slate.
```

---

## Error Handling

### In Routes

```python
@router.get("/{tracker_id}/")
def read_tracker(tracker_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    tracker = db.query(models.Tracker).filter(models.Tracker.id == tracker_id).first()
    
    if not tracker:
        raise HTTPException(status_code=404, detail="Tracker not found")
        
    if tracker.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return tracker
```

### Common Patterns
```python
# Not found
raise HTTPException(status_code=404, detail="Resource not found")
# Unauthorized
raise HTTPException(status_code=401, detail="Invalid credentials")
# Forbidden
raise HTTPException(status_code=403, detail="Not enough permissions")
# Validation error
raise HTTPException(status_code=400, detail="Invalid data")
```

---

## Performance Considerations

### Database Queries

**Avoid N+1 queries:**

```python
# ✗ Bad: Creates N+1 queries
trackers = db.query(models.Tracker).all()
for tracker in trackers:
    logs = db.query(models.HabitLog).filter(...).all()

# ✓ Good: Single query
trackers = db.query(models.Tracker).all()
logs = db.query(models.HabitLog).all()  # Fetch all at once
```

### Date Math

The analytics module includes optimized date calculations:

```python
# Handles edge cases like Feb 31st
shift_period(datetime(2024, 1, 31), "month", 1)
# Returns: datetime(2024, 2, 29)  # Feb has 29 days in leap year
```

---

## Database Schema

### Users & Groups Table
```
users
- id (int) PRIMARY KEY
- username (string)
- email (string)
- hashed_password (string)

groups
- id (int) PRIMARY KEY
- name (string)
- owner_id (int) FOREIGN KEY (users.id)
- join_code (string)
```

### Trackers Table
```
trackers
- id (int) PRIMARY KEY
- owner_id (int) FOREIGN KEY (users.id)
- group_id (int, nullable) FOREIGN KEY (groups.id)
- name (string)
- category (string)
- type (string) - "build", "quit", "boolean"
- unit (string)
...
```

### HabitLog Table
```
habit_logs
- id (int) PRIMARY KEY
- tracker_id (int) FOREIGN KEY
- user_id (int) FOREIGN KEY
- timestamp (datetime)
- amount (float)
```

### UserDashboardState Table
```
user_dashboard_states
- id (int) PRIMARY KEY
- user_id (int) FOREIGN KEY
- name (string) - "home"
- widgets_json (string) - JSON
- layouts_json (string) - JSON
```

---

## Advanced Topics

### Database Migrations
AnyHabit handles migrations on startup. When you add a new column to a model in `models.py`, ensure to add an `ALTER TABLE` execution step inside `migrations.py` so existing databases are updated without data loss.

### Data Export/Import Mechanism
The backup script (`routers/export.py`) uses a raw dictionary mapping `_model_to_dict()` instead of relying purely on schemas. This ensures that a database export behaves exactly like a direct SQLAlchemy query dump. When importing, the backend creates fresh models `models.Tracker(**t_data)` while explicitly discarding the old auto-increment `id`.

---

## Debugging

### Enable Logging

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Database Inspection (Docker)

```bash
# Exec into container
docker exec -it anyhabit-backend bash
sqlite3 data/anyhabit.db
sqlite> SELECT username, email FROM users;
```

## Deployment

### Docker

```bash
# Build & Run via Compose (Recommended)
docker compose up -d --build
```

### Production Checklist

- [x] Add authentication (JWT implemented)
- [x] Multi-user isolation
- [x] Database backups (via Backup-Export JSON)
- [ ] Use PostgreSQL (not SQLite - optional for larger deployments)
- [ ] Set secure CORS origins
- [ ] Error monitoring (e.g., Sentry)

---

## Resources

- **FastAPI Docs:** https://fastapi.tiangolo.com/
- **SQLAlchemy Docs:** https://docs.sqlalchemy.org/
- **Pydantic Docs:** https://docs.pydantic.dev/
- **API Documentation:** [README.md](./README.md)

---

## Contributing

When contributing:

1. Follow the existing code style
2. Update documentation
3. Check with `pylint` or `black` (optional)

See [CONTRIBUTING.md](../CONTRIBUTING.md) for details.

---

**Last Updated:** June 2026  
**Version:** 1.1.0  
**Maintainers:** [AnyHabit Team](https://github.com/Sparths/AnyHabit)
