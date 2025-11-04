const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Group Savings & Loan Management API',
      version: '1.0.0',
      description: 'A comprehensive API for managing group savings and loan operations with role-based access control.',
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      }
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production'
          ? 'https://your-production-url.com/api'
          : `http://localhost:${process.env.PORT || 5000}/api`,
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token obtained from login endpoint'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            firstName: { type: 'string', example: 'John' },
            lastName: { type: 'string', example: 'Doe' },
            email: { type: 'string', format: 'email', example: 'john.doe@example.com' },
            role: { type: 'string', enum: ['admin', 'branch_lead', 'member'], example: 'member' },
            membershipId: { type: 'string', example: 'MB0001' },
            branch: { $ref: '#/components/schemas/Branch' },
            isActive: { type: 'boolean', example: true },
            totalContributions: { type: 'number', example: 5000 },
            totalLoans: { type: 'number', example: 2000 },
            totalPenalties: { type: 'number', example: 100 },
            joinDate: { type: 'string', format: 'date-time' },
            lastLogin: { type: 'string', format: 'date-time' }
          }
        },
        Branch: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            name: { type: 'string', example: 'Downtown Branch' },
            code: { type: 'string', example: 'DT001' },
            location: { type: 'string', example: 'Downtown District' },
            branchLead: { $ref: '#/components/schemas/User' },
            isActive: { type: 'boolean', example: true },
            establishedDate: { type: 'string', format: 'date-time' }
          }
        },
        Contribution: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            member: { $ref: '#/components/schemas/User' },
            amount: { type: 'number', example: 500 },
            contributionType: { type: 'string', enum: ['monthly', 'weekly', 'special', 'penalty_payment'], example: 'monthly' },
            contributionDate: { type: 'string', format: 'date-time' },
            recordedBy: { $ref: '#/components/schemas/User' },
            branch: { $ref: '#/components/schemas/Branch' },
            description: { type: 'string', example: 'Monthly contribution for January' },
            status: { type: 'string', enum: ['pending', 'confirmed', 'cancelled'], example: 'confirmed' }
          }
        },
        Loan: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            member: { $ref: '#/components/schemas/User' },
            amount: { type: 'number', example: 10000 },
            interestRate: { type: 'number', example: 5.5 },
            duration: { type: 'number', example: 12 },
            purpose: { type: 'string', example: 'Business expansion' },
            status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'disbursed', 'repaid', 'defaulted'], example: 'pending' },
            appliedDate: { type: 'string', format: 'date-time' },
            approvedBy: { $ref: '#/components/schemas/User' },
            approvedDate: { type: 'string', format: 'date-time' },
            disbursedDate: { type: 'string', format: 'date-time' },
            dueDate: { type: 'string', format: 'date-time' },
            totalAmount: { type: 'number', example: 10550 },
            amountPaid: { type: 'number', example: 0 },
            remainingAmount: { type: 'number', example: 10550 },
            branch: { $ref: '#/components/schemas/Branch' },
            rejectionReason: { type: 'string', example: 'Insufficient collateral' }
          }
        },
        Penalty: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            member: { $ref: '#/components/schemas/User' },
            amount: { type: 'number', example: 50 },
            reason: { type: 'string', enum: ['late_contribution', 'missed_meeting', 'late_loan_repayment', 'policy_violation', 'other'], example: 'late_contribution' },
            description: { type: 'string', example: 'Late monthly contribution for January' },
            assignedBy: { $ref: '#/components/schemas/User' },
            status: { type: 'string', enum: ['pending', 'paid', 'waived'], example: 'pending' },
            assignedDate: { type: 'string', format: 'date-time' },
            paidDate: { type: 'string', format: 'date-time' },
            waivedDate: { type: 'string', format: 'date-time' },
            waivedBy: { $ref: '#/components/schemas/User' },
            branch: { $ref: '#/components/schemas/Branch' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'error' },
            message: { type: 'string', example: 'Validation failed' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string', example: 'email' },
                  message: { type: 'string', example: 'Please provide a valid email' }
                }
              }
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            message: { type: 'string', example: 'Operation completed successfully' },
            data: { type: 'object' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./routes/*.js', './server.js']
};

const specs = swaggerJsdoc(options);

module.exports = specs;