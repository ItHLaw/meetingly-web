#!/bin/bash

# Run tests with coverage
echo "Running tests with coverage..."
python -m pytest tests/ -v --cov=app --cov-report=term --cov-report=html:coverage_report

# Exit with the pytest exit code
exit $?